#!/usr/bin/env bash
# STEP 2 (systemd only). Creates the env file with a PLACEHOLDER and a drop-in
# that loads it. Does NOT touch the main unit file, does NOT restart anything.
#
#   sudo bash deploy/2_setup_systemd.sh <service-name>      e.g. cobrabyte.service
#
# Afterwards edit ONE line in /etc/cobrabyte/gemini.env:
#   GEMINI_API_KEY=PASTE_KEY_HERE   ->   GEMINI_API_KEY=<your key>
set -eu

ENV_DIR=/etc/cobrabyte
ENV_FILE=$ENV_DIR/gemini.env

die() { echo "STOP: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run with sudo."
[ $# -eq 1 ] || die "usage: sudo bash $0 <service-name>"
svc=$1
case $svc in *.service) ;; *) svc=$svc.service ;; esac

[ "$(ps -p 1 -o comm=)" = systemd ] || die "systemd is not the init system here."
systemctl cat "$svc" >/dev/null 2>&1 || die "no systemd unit called $svc."

# 1. env file: root-owned, mode 600. systemd reads EnvironmentFile= as root
#    before dropping to the service user, so the service user needs no access.
install -d -m 755 -o root -g root "$ENV_DIR"
if [ -e "$ENV_FILE" ]; then
  echo "kept existing $ENV_FILE (not overwritten)"
else
  ( umask 077
    cat >"$ENV_FILE" <<'EOF'
# CobraByte - read by systemd (EnvironmentFile=). No quotes, no spaces around '='.
GEMINI_API_KEY=PASTE_KEY_HERE
# Optional: force one model name instead of the app's default list.
#GEMINI_MODEL=
EOF
  )
  echo "created $ENV_FILE"
fi
chown root:root "$ENV_FILE"
chmod 600 "$ENV_FILE"

# 2. drop-in (the main unit file is left untouched)
dropin_dir=/etc/systemd/system/$svc.d
install -d -m 755 "$dropin_dir"
cat >"$dropin_dir/gemini.conf" <<EOF
[Service]
EnvironmentFile=$ENV_FILE
EOF
chmod 644 "$dropin_dir/gemini.conf"
echo "created $dropin_dir/gemini.conf"

systemctl daemon-reload

# 3. verify systemd sees it (paths only - no values)
echo
systemctl show "$svc" -p EnvironmentFiles -p DropInPaths --no-pager
stat -c '%A %U:%G %n' "$ENV_FILE"

echo
echo "Next: edit line 2 of $ENV_FILE  ->  sudo nano $ENV_FILE"
echo "      replace PASTE_KEY_HERE with your key. Nothing has been restarted."
