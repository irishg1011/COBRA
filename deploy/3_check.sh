#!/usr/bin/env bash
# STEP 3 - run AFTER the key is pasted in and the app has been restarted.
# Never prints the key. Reports: is it in the running process, the HTTP status
# from Google's models list, and which Flash models the key can use.
#
#   sudo bash deploy/3_check.sh <service-name>     (systemd)
#   sudo bash deploy/3_check.sh --pid <PID>        (any other setup)
#
# Key source: /etc/cobrabyte/gemini.env, or set ENV_FILE=/path/to/file.
set -u

ENV_FILE=${ENV_FILE:-/etc/cobrabyte/gemini.env}
URL='https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'

die() { echo "STOP: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run with sudo (the env file and /proc/<pid>/environ are root-only)."

# --- read the key from the env file (into a variable only) ---
[ -r "$ENV_FILE" ] || die "cannot read $ENV_FILE."
grep -q $'\r' "$ENV_FILE" && echo "WARNING: $ENV_FILE has Windows line endings; fix with: sudo sed -i 's/\r\$//' $ENV_FILE"
key=$(sed -n 's/^[[:space:]]*GEMINI_API_KEY[[:space:]]*=//p' "$ENV_FILE" | tail -n1 | tr -d '\r' \
      | sed -e 's/^[[:space:]"'\'']*//' -e 's/[[:space:]"'\'']*$//')
[ -n "$key" ] || die "GEMINI_API_KEY is empty in $ENV_FILE."
[ "$key" != PASTE_KEY_HERE ] || die "the placeholder is still there - paste the key into $ENV_FILE first."
echo "key in $ENV_FILE: present, ${#key} characters"

# --- 1. is it in the running process? ---
if [ "${1:-}" = --pid ]; then
  pids=${2:?usage: --pid <PID>}
else
  svc=${1:?usage: sudo bash $0 <service-name> | --pid <PID>}
  main=$(systemctl show -p MainPID --value "$svc")
  [ "${main:-0}" -gt 0 ] || die "$svc is not running (MainPID=0)."
  pids="$main $(pgrep -P "$main" | tr '\n' ' ')"   # gunicorn/uwsgi workers too
fi
echo
for pid in $pids; do
  [ -r "/proc/$pid/environ" ] || { echo "PID $pid: not readable"; continue; }
  val=$(tr '\0' '\n' <"/proc/$pid/environ" | sed -n 's/^GEMINI_API_KEY=//p' | tail -n1)
  if [ -z "$val" ]; then
    echo "PID $pid: GEMINI_API_KEY NOT SET  <- restart did not pick it up"
  elif [ "$(printf %s "$val" | tr -d '\r[:space:]')" = "$key" ]; then
    echo "PID $pid: GEMINI_API_KEY set, matches the env file"
  else
    echo "PID $pid: GEMINI_API_KEY set, but DIFFERS from the env file (restart needed?)"
  fi
  model=$(tr '\0' '\n' <"/proc/$pid/environ" | sed -n 's/^GEMINI_MODEL=//p' | tail -n1)
  [ -n "$model" ] && echo "         GEMINI_MODEL=$model"
done
unset val

# --- 2. can this server reach Google, and does the key work? ---
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
# The header goes to curl on stdin (-K -), so the key is never in argv / ps / history.
status=$(printf 'header = "x-goog-api-key: %s"\n' "$key" \
         | curl -sS -m 20 -o "$tmp" -w '%{http_code}' -K - "$URL" 2>/dev/null)
unset key
echo
echo "models list HTTP status: ${status:-000}"
case ${status:-000} in
  200) ;;
  000) die "no connection - the server cannot reach generativelanguage.googleapis.com (firewall/DNS/proxy)." ;;
  400) die "key rejected (usually an invalid or mistyped key)." ;;
  403) die "key not allowed (Generative Language API not enabled, or the key has IP/API restrictions)." ;;
  429) die "rate limited / quota exhausted for this key." ;;
  *)   die "unexpected status." ;;
esac

# --- 3. which Flash models can this key use? ---
echo
python3 - "$tmp" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
usable = sorted(
    m["name"].split("/", 1)[1]
    for m in data.get("models", [])
    if "generateContent" in m.get("supportedGenerationMethods", [])
)
flash = [n for n in usable if "flash" in n]
for want in ("gemini-3.8-flash", "gemini-2.5-flash"):
    print(f"{want:18} available: {'YES' if want in usable else 'no'}")
print("\nall Flash models this key can use:")
print("\n".join("  " + n for n in flash) or "  (none)")
if not any(w in usable for w in ("gemini-3.8-flash", "gemini-2.5-flash")) and flash:
    print(f"\nNeither default is available. Set GEMINI_MODEL={flash[-1]} (or another from the list).")
PY
