# Running the CRM in production on the Mac mini

Production is a **launchd LaunchDaemon**, not `npm run dev` typed into a remote terminal.
launchd starts the app at boot (no login needed), restarts it whenever it exits — a crash, a
kill, a reboot — keeps it running after you close the remote shell, and writes its output to
`logs/`. It is the macOS equivalent of systemd.

## One-time install (on the mini)

1. Fill the three `CHANGE-ME` placeholders in `deploy/com.upgrads.crm.plist`:
   - the node binary: the output of `which node`
   - the repo path: `pwd` inside the clone (appears three times: WorkingDirectory and the two log paths)
   - the user: `whoami`
2. `.env` must sit in the repo directory (it is gitignored, so it lives only on the mini), and the
   log directory must exist: `mkdir -p logs`
3. Install and start the daemon:
   ```sh
   sudo cp deploy/com.upgrads.crm.plist /Library/LaunchDaemons/
   sudo chown root:wheel /Library/LaunchDaemons/com.upgrads.crm.plist
   sudo chmod 644 /Library/LaunchDaemons/com.upgrads.crm.plist
   sudo launchctl bootstrap system /Library/LaunchDaemons/com.upgrads.crm.plist
   ```
4. Confirm it is up:
   ```sh
   sudo launchctl print system/com.upgrads.crm | grep -E "state|pid"   # state = running
   tail -f logs/crm.log                                                   # "CRM running at http://localhost:3000"
   ```
5. **Stop using `npm run dev` on the mini.** A dev server still running from an old terminal
   fights the daemon for port 3000 — find and end it first: `lsof -i :3000`.

## Every deploy

```sh
git pull
npm ci --omit=dev                                       # production install; nodemon is not needed
sudo launchctl kickstart -k system/com.upgrads.crm      # restart (-k ends the running one first)
tail -n 20 logs/crm.log                                 # "CRM running …" — or "Database init failed"
```

A restart is **required** after any change that adds a column in `initDb()` (readmedev.md); the
app only migrates at boot.

## Day to day

| | |
|---|---|
| logs | `tail -f logs/crm.log logs/crm.err.log` |
| restart | `sudo launchctl kickstart -k system/com.upgrads.crm` |
| stop | `sudo launchctl bootout system/com.upgrads.crm` |
| start again | `sudo launchctl bootstrap system /Library/LaunchDaemons/com.upgrads.crm.plist` |
| status | `sudo launchctl print system/com.upgrads.crm \| grep -E "state\|pid\|last exit"` |

Logs are appended forever. If `logs/` grows large, truncate in place — `: > logs/crm.log` — the app
keeps writing to the same file.

## Keep the mini awake

A sleeping Mac is the usual reason a mini "went down overnight":

```sh
sudo pmset -a sleep 0 disksleep 0 displaysleep 10 womp 1
```

(no system sleep, display may sleep, wake on network.)

## What changed from the old way

- **`NODE_ENV=production` is now set** by the plist. `server.js` applies its Content-Security-Policy
  only when it is; it had never been set, so production ran with the CSP off.
- **`npm start` uses `--env-file-if-exists=.env`** (Node ≥ 22.9): boots with or without a `.env`
  file, so the same command works on a host that injects variables. Check `node --version` on the
  mini; on an older 22.x put `--env-file=.env` in the plist instead.
- **No shell restart loop.** Measured before this change: an `until nodemon …; do …; done` loop
  never fires on an app crash (nodemon waits for a file change instead of exiting) and ignores
  Ctrl+C (nodemon exits 130, which `until` reads as "retry"). nodemon is a devDependency and
  restarts on any file change — a mid-deploy hazard. Supervision is launchd's job.
