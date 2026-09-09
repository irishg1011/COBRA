"""
code_sandbox.py - Learner Coding Sandbox: Interactive Python Execution
------------------------------------------------------------------------------------------
Backs the Coding Sandbox's live terminal behavior: Run Code starts a
REAL, LONG-LIVED subprocess (not a one-shot "run to completion and
return the output" call), the browser polls it for new output every
~250ms, and typing into the console's own input line writes straight
to that process's stdin - so input() genuinely pauses the program and
waits for whatever the learner types next, exactly like a real
terminal, instead of requiring input to be provided up front.

WHY POLLING INSTEAD OF WEBSOCKETS
This avoids adding a new dependency (Flask-SocketIO) or an ASGI
server swap - plain HTTP polling against an in-memory run registry is
enough for a classroom-scale sandbox. The trade-off: this registry
(_runs) lives in this one Python process's memory, so it only works
correctly with Flask's default single-process dev server. A
multi-worker/gunicorn production deployment would need a shared store
(e.g. Redis) instead, since a poll could land on a different worker
than the one that started the run.

SECURITY MODEL - unchanged from before, read this before deploying
publicly. This runs whatever Python a logged-in learner submits, as a
subprocess of the Flask server, with the server's own filesystem/
network permissions:
    - Every route calling this requires a valid learner session - see
      learner_routes.get_current_learner_acc_id().
    - Every run/poll/input/stop call is scoped to the acc_id that
      started the run - one learner can never poll, feed input to, or
      stop another learner's process, even if they guess a run_id.
    - MAX_RUN_SECONDS bounds a run's total wall-clock life;
      IDLE_TIMEOUT_SECONDS additionally kills it if nothing happens
      for a while (e.g. the learner closes the tab mid input()).
    - MAX_CONCURRENT_RUNS_PER_LEARNER stops one tab from forking
      unlimited processes.
    - Output is capped at MAX_OUTPUT_CHARS per run.
    - `-I` (isolated mode) keeps the child from reading this machine's
      site-packages/env. `-u` (unbuffered) is REQUIRED for real-time
      streaming - without it, Python fully buffers stdout when it
      isn't attached to a real terminal, so prompts like
      input("name: ") would never appear until the buffer flushed.
    - On POSIX only (the `resource` module doesn't exist on Windows),
      CPU time and address-space are additionally capped as
      defense-in-depth beyond the timeouts above.
    - Each run gets its own throwaway temp directory, deleted once it
      finishes, win or lose.

KNOWN LIMITATION: stdout and stderr are captured as two independent
streams and reported to the frontend separately (see poll_run()), so
their exact chronological interleaving isn't preserved - a print()
right before an exception may visually appear as two separate blocks
rather than perfectly interleaved lines. Fine for a learning sandbox;
a true single merged stream would need a pseudo-terminal (the `pty`
module), which doesn't exist on Windows.
"""

import os
import sys
import subprocess
import tempfile
import threading
import time
import uuid
import shutil

MAX_RUN_SECONDS = 120           # hard ceiling on one run's total wall-clock life
IDLE_TIMEOUT_SECONDS = 90       # killed if no output/input activity for this long
REAP_FINISHED_AFTER_SECONDS = 120  # finished runs are forgotten this long afterward
MAX_CODE_LENGTH = 20000         # characters
MAX_OUTPUT_CHARS = 200000       # characters, per run, across its whole lifetime
MAX_CONCURRENT_RUNS_PER_LEARNER = 3

_runs_lock = threading.Lock()
_runs = {}  # run_id -> run state dict, see _new_run_state()


def _limit_resources():
    """POSIX-only defense-in-depth - see module docstring. Silently
    skipped on Windows, where the `resource` module doesn't exist."""
    if os.name == "nt":
        return
    try:
        import resource
        cpu_seconds = MAX_RUN_SECONDS + 5
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        mem_bytes = 256 * 1024 * 1024  # 256MB
        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
    except Exception:
        pass


def _new_run_state(acc_id, temp_dir, process):
    return {
        "acc_id": acc_id,
        "temp_dir": temp_dir,
        "process": process,
        "output": [],           # list of {"stream": "stdout"|"stderr", "text": str}
        "total_len": 0,
        "truncated": False,
        "finished": False,
        "exit_code": None,
        "timed_out": False,
        "stopped_by_user": False,
        "started_at": time.time(),
        "last_activity": time.time(),
        "finished_at": None,
    }


def _reader_thread(run_id, stream, stream_name):
    """
    Reads the child's stdout/stderr live, ONE CHARACTER AT A TIME.
    That's deliberate, not an oversight: TextIOWrapper.read(n) with
    n > 1 is allowed to block gathering up to n characters before
    returning when the underlying stream isn't a real terminal (which
    a pipe never is) - which would silently defeat real-time
    streaming for exactly the case that matters most here (a prompt
    like "name: " with no trailing newline). read(1) is the only size
    that's guaranteed to return as soon as a single character is
    available.
    """
    try:
        while True:
            chunk = stream.read(1)
            if chunk == "":
                break
            with _runs_lock:
                run = _runs.get(run_id)
                if run is None:
                    break
                if run["total_len"] < MAX_OUTPUT_CHARS:
                    run["output"].append({"stream": stream_name, "text": chunk})
                    run["total_len"] += 1
                elif not run["truncated"]:
                    run["output"].append({
                        "stream": "stderr",
                        "text": f"\n... (output truncated at {MAX_OUTPUT_CHARS} characters)",
                    })
                    run["truncated"] = True
                run["last_activity"] = time.time()
    except Exception:
        pass


def _watchdog_thread(run_id):
    """Kills the process if it exceeds MAX_RUN_SECONDS total, or sits
    idle past IDLE_TIMEOUT_SECONDS (e.g. blocked on input() forever
    because the learner navigated away without typing anything)."""
    while True:
        time.sleep(1)
        with _runs_lock:
            run = _runs.get(run_id)
            if run is None or run["finished"]:
                return
            now = time.time()
            expired = (now - run["started_at"] > MAX_RUN_SECONDS) or (now - run["last_activity"] > IDLE_TIMEOUT_SECONDS)
        if expired:
            _finish_run(run_id, timed_out=True)
            return


def _wait_and_finish(run_id):
    """Blocks until the child exits naturally, then finalizes the run.
    Harmless if the watchdog or an explicit stop already finalized it
    first - _finish_run() no-ops on an already-finished run."""
    with _runs_lock:
        run = _runs.get(run_id)
        if run is None:
            return
        process = run["process"]
    try:
        process.wait()
    except Exception:
        pass
    _finish_run(run_id)


def _finish_run(run_id, timed_out=False, stopped_by_user=False):
    with _runs_lock:
        run = _runs.get(run_id)
        if run is None or run["finished"]:
            return
        process = run["process"]

    exit_code = None
    try:
        if timed_out or stopped_by_user:
            process.kill()
        exit_code = process.wait(timeout=5)
    except Exception:
        try:
            process.kill()
        except Exception:
            pass

    with _runs_lock:
        run = _runs.get(run_id)
        if run is None:
            return
        run["finished"] = True
        run["exit_code"] = exit_code
        run["timed_out"] = timed_out
        run["stopped_by_user"] = stopped_by_user
        run["finished_at"] = time.time()
        if timed_out:
            run["output"].append({
                "stream": "stderr",
                "text": f"\n[Stopped automatically: exceeded {MAX_RUN_SECONDS}s total or {IDLE_TIMEOUT_SECONDS}s idle]",
            })
        elif stopped_by_user:
            run["output"].append({"stream": "stderr", "text": "\n[Stopped]"})
        temp_dir = run["temp_dir"]

    shutil.rmtree(temp_dir, ignore_errors=True)


def _reap_old_runs():
    now = time.time()
    with _runs_lock:
        stale_ids = [
            rid for rid, r in _runs.items()
            if r["finished"] and r.get("finished_at") and (now - r["finished_at"] > REAP_FINISHED_AFTER_SECONDS)
        ]
        for rid in stale_ids:
            del _runs[rid]


def start_run(code, acc_id):
    """
    Spawns the learner's code as a live, pollable subprocess.
    Returns (success: bool, run_id: str | None, error_message: str | None)
    """
    _reap_old_runs()

    if not isinstance(code, str):
        code = "" if code is None else str(code)
    if not code.strip():
        return False, None, "Nothing to run - write some code first."
    if len(code) > MAX_CODE_LENGTH:
        return False, None, f"Code is too long (max {MAX_CODE_LENGTH} characters)."

    with _runs_lock:
        active_for_learner = sum(
            1 for r in _runs.values() if r["acc_id"] == acc_id and not r["finished"]
        )
    if active_for_learner >= MAX_CONCURRENT_RUNS_PER_LEARNER:
        return False, None, "You already have code running. Stop it before starting another run."

    temp_dir = tempfile.mkdtemp(prefix="cobrabyte_sandbox_")
    script_path = os.path.join(temp_dir, "main.py")

    try:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)
    except OSError as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return False, None, f"Could not prepare code: {e}"

    popen_kwargs = dict(
        args=[sys.executable, "-I", "-u", script_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        cwd=temp_dir,
    )
    if os.name != "nt":
        popen_kwargs["preexec_fn"] = _limit_resources

    try:
        process = subprocess.Popen(**popen_kwargs)
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return False, None, f"Could not start code: {e}"

    run_id = uuid.uuid4().hex
    with _runs_lock:
        _runs[run_id] = _new_run_state(acc_id, temp_dir, process)

    threading.Thread(target=_reader_thread, args=(run_id, process.stdout, "stdout"), daemon=True).start()
    threading.Thread(target=_reader_thread, args=(run_id, process.stderr, "stderr"), daemon=True).start()
    threading.Thread(target=_watchdog_thread, args=(run_id,), daemon=True).start()
    threading.Thread(target=_wait_and_finish, args=(run_id,), daemon=True).start()

    return True, run_id, None


def poll_run(run_id, acc_id, cursor):
    """
    Returns new output produced since `cursor` (the value this same
    function returned as "cursor" last time), plus finished/exit_code/
    timed_out state. Scoped to the requesting learner's own acc_id -
    polling another learner's run_id returns None ("not found"), never
    their output.
    """
    with _runs_lock:
        run = _runs.get(run_id)
        if run is None or run["acc_id"] != acc_id:
            return None
        chunks = run["output"][cursor:]
        new_cursor = len(run["output"])
        finished = run["finished"]
        exit_code = run["exit_code"]
        timed_out = run["timed_out"]

    return {
        "stdout": "".join(c["text"] for c in chunks if c["stream"] == "stdout"),
        "stderr": "".join(c["text"] for c in chunks if c["stream"] == "stderr"),
        "cursor": new_cursor,
        "finished": finished,
        "exit_code": exit_code,
        "timed_out": timed_out,
    }


def send_input(run_id, acc_id, line):
    """Writes one line to the running program's stdin, as if the
    learner had typed it and pressed Enter in a real terminal."""
    with _runs_lock:
        run = _runs.get(run_id)
        if run is None or run["acc_id"] != acc_id:
            return False, "Run not found."
        if run["finished"]:
            return False, "This program has already finished."
        process = run["process"]
        run["last_activity"] = time.time()

    try:
        process.stdin.write((line or "") + "\n")
        process.stdin.flush()
        return True, None
    except Exception as e:
        return False, f"Could not send input: {e}"


def stop_run(run_id, acc_id):
    """Learner-requested early stop (e.g. they wrote an infinite loop
    and don't want to wait for the timeout)."""
    with _runs_lock:
        run = _runs.get(run_id)
        if run is None or run["acc_id"] != acc_id:
            return False
    _finish_run(run_id, stopped_by_user=True)
    return True