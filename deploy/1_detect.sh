#!/usr/bin/env bash
# STEP 1 - READ-ONLY. Finds out how CobraByte (Flask, server/login.py) is started
# and kept running on this server. Changes nothing. Never prints any secret.
#
#   sudo bash deploy/1_detect.sh
set -u

section() { printf '\n== %s ==\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "Init system (PID 1)"
init=$(ps -p 1 -o comm= 2>/dev/null)
echo "${init:-unknown}"

section "App processes"
pids=$(pgrep -f 'login\.py|gunicorn|uwsgi|waitress|flask' | grep -vx "$$" || true)
if [ -z "$pids" ]; then
  echo "No python/gunicorn/uwsgi/waitress/flask process is running."
fi
for pid in $pids; do
  [ -r "/proc/$pid/cmdline" ] || continue
  echo "PID $pid: $(tr '\0' ' ' <"/proc/$pid/cmdline")"
  echo "  user:   $(ps -o user= -p "$pid")"
  echo "  cwd:    $(readlink "/proc/$pid/cwd" 2>/dev/null)"
  echo "  cgroup: $(head -n1 "/proc/$pid/cgroup" 2>/dev/null)"
  chain="" p=$pid
  while [ "${p:-0}" -gt 1 ]; do
    p=$(ps -o ppid= -p "$p" | tr -d ' ')
    [ -n "$p" ] && chain="$chain <- $(ps -o comm= -p "$p")($p)"
  done
  echo "  parents:$chain"
  if tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | grep -q '^GEMINI_API_KEY=.'; then
    echo "  GEMINI_API_KEY in this process: yes (value not shown)"
  else
    echo "  GEMINI_API_KEY in this process: no"
  fi
done

section "Listening ports (python / gunicorn / uwsgi)"
if have ss; then ss -ltnp 2>/dev/null | grep -Ei 'python|gunicorn|uwsgi|waitress' || echo "none"; fi

section "systemd units that mention the app"
if [ "$init" = systemd ]; then
  units=$(grep -rlEi 'login\.py|login:app|gunicorn|uwsgi|flask|cobra' \
            /etc/systemd/system /lib/systemd/system /usr/lib/systemd/system 2>/dev/null \
          | grep '\.service$' | sort -u)
  if [ -z "$units" ]; then echo "none"; fi
  for u in $units; do
    name=$(basename "$u")
    echo "$u"
    echo "  active=$(systemctl is-active "$name") enabled=$(systemctl is-enabled "$name" 2>/dev/null)"
    systemctl show "$name" -p User -p WorkingDirectory -p ExecStart -p EnvironmentFiles -p DropInPaths --no-pager \
      | sed 's/^/  /'
  done
else
  echo "systemd is not PID 1 here."
fi

section "supervisor"
if have supervisorctl; then supervisorctl status 2>&1; else echo "not installed"; fi

section "pm2"
if have pm2; then
  if [ -n "${SUDO_USER:-}" ]; then sudo -u "$SUDO_USER" pm2 ls 2>&1; fi
  pm2 ls 2>&1
else
  echo "not installed"
fi

section "docker"
if have docker; then docker ps --format '{{.Names}}  {{.Image}}  {{.Status}}' 2>&1; else echo "not installed"; fi

section "screen / tmux sessions"
ls -d /run/screen/S-*/* /var/run/screen/S-*/* 2>/dev/null || echo "no screen sessions"
ls -d /tmp/tmux-*/* 2>/dev/null || echo "no tmux sockets"

section "Started at boot by cron / rc.local"
grep -rn '@reboot' /var/spool/cron /etc/crontab /etc/cron.d 2>/dev/null || echo "no @reboot cron lines"
[ -f /etc/rc.local ] && grep -nEi 'python|gunicorn|flask|login' /etc/rc.local

section "Reverse proxy (nginx / apache)"
grep -rnE 'proxy_pass|uwsgi_pass' /etc/nginx 2>/dev/null || echo "no nginx proxy lines"
grep -rnEi 'ProxyPass|WSGIScriptAlias' /etc/apache2 /etc/httpd 2>/dev/null || echo "no apache proxy lines"

echo
echo "Done. Nothing was changed. Send this whole output back (it contains no secrets)."
