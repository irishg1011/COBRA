# Setting GEMINI_API_KEY on the server

`server/exercise_ai.py` reads `GEMINI_API_KEY` (required) and `GEMINI_MODEL`
(optional) from the **process environment**. The app does not load `.env`, so
the variable must be given to the process by whatever starts it.

The key never goes in this repo. It lives in `/etc/cobrabyte/gemini.env`
(root-only, mode 600), outside the project folder and outside git.

## Step 1 - find out how the app runs (read-only)

```bash
cd /path/to/COBRA && git pull
sudo bash deploy/1_detect.sh
```

Look at the **App processes** section:

| You see                                              | Setup      |
|------------------------------------------------------|------------|
| `cgroup: 0::/system.slice/<name>.service`            | systemd    |
| parents include `supervisord`                        | supervisor |
| parents include `PM2`                                | pm2        |
| parents include `containerd-shim` / listed in docker | docker     |
| parents include `screen` / `tmux` / `bash` only      | by hand    |
| no app process at all                                | not running |

## Step 2 - systemd (the normal case)

```bash
sudo bash deploy/2_setup_systemd.sh <service-name>
sudo nano /etc/cobrabyte/gemini.env
```

Edit **line 2** only:

```
GEMINI_API_KEY=PASTE_KEY_HERE      ->      GEMINI_API_KEY=<your key>
```

No quotes, no spaces. Save. What the script made:

- `/etc/cobrabyte/gemini.env` - `root:root`, mode `600`. systemd reads it as
  root before starting the service, so the service user needs no access.
- `/etc/systemd/system/<service>.service.d/gemini.conf` - one line,
  `EnvironmentFile=/etc/cobrabyte/gemini.env`. The main unit file is untouched.

Then restart and check:

```bash
sudo systemctl restart <service-name>
sudo bash deploy/3_check.sh <service-name>
```

Reboot-safe: systemd re-reads the drop-in and env file on every start.

## Other setups

Create the same env file by hand first:

```bash
sudo install -d -m 755 /etc/cobrabyte
sudo sh -c 'umask 077; printf "GEMINI_API_KEY=PASTE_KEY_HERE\n" > /etc/cobrabyte/gemini.env'
```

- **docker**: `docker run --env-file /etc/cobrabyte/gemini.env ...`, or in
  compose: `env_file: [/etc/cobrabyte/gemini.env]`. Recreate the container
  (`docker compose up -d`). Check with `sudo bash deploy/3_check.sh --pid <host PID>`.
- **supervisor**: it has no env-file option. Change the program's
  `command=` to `bash -c 'set -a; . /etc/cobrabyte/gemini.env; exec <old command>'`,
  then `sudo supervisorctl reread && sudo supervisorctl update`.
- **pm2**: start through the same `bash -c 'set -a; . /etc/cobrabyte/gemini.env; exec ...'`
  wrapper, then `pm2 save` (and `pm2 startup` once, for reboots).
- **by hand (screen/tmux/nohup)**: this does **not** survive a reboot whatever
  you do with the key. Convert it to a systemd service first, then use the
  systemd steps above.

## Rules

- Never `echo`, `cat` or paste the key into a command line; edit the file.
- `3_check.sh` sends the key to curl on stdin, so it never shows in `ps`.
