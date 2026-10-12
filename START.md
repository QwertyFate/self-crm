# Starting the CRM

Three commands. Nothing to configure. Everything the CRM needs is created in the project folder
the first time it starts.

## 1. Install Node.js (once per computer)

Download the **LTS** version (22 or newer) from <https://nodejs.org> and run the installer.
npm comes with it. Check in the Terminal:

```sh
node --version
```

You should see `v22` or higher.

## 2. Get the project folder onto the computer

Copy the folder, or clone it:

```sh
git clone <repository address> crm
```

## 3. Open the Terminal in that folder and run

```sh
cd crm          # or drag the folder onto the Terminal window after typing "cd "
npm install     # once, and again after an update
npm run dev
```

Wait for this line:

```
CRM running at http://localhost:4001
```

Open <http://localhost:4001> in the browser. Click **Create a new workspace**, give it a name,
enter your name, email and a password. You are in, as the owner. Colleagues sign up the same way
and choose **Join an existing workspace**: your workspace is in the list, no code needed.

The first start also prints `Embedded database ready: …/data/pgdata`. That is normal.

## Day to day

- **Stop**: `Ctrl + C` in the Terminal. **Start again**: `npm run dev`. The data stays.
- **Where things live**: `data/` holds the database, uploaded files and secrets; `backups/` gets one
  archive per day while the CRM runs. Both are next to the code. Copy `backups/` somewhere else now
  and then, or set `BACKUP_DIR` (below).
- **Colleagues on the same network** open `http://<this-mac-name>.local:4001` or
  `http://<this-mac-ip>:4001`. The computer name is in System Settings → General → Sharing →
  "Local hostname". The first time, macOS asks whether `node` may accept incoming connections — Allow.
- **Forgot a password**: the login screen has **Forgot password**. Enter the email, set a new one.
  No email is involved.
- **Admin console**: <http://localhost:4001/adminconsole>. Open, no secret.
- **Backups by hand**: Admin console → Platform Defaults → Backups → **Download backup** or
  **Save a backup now**. From the Terminal with the CRM stopped: `npm run backup`, and
  `npm run restore -- backups/<file>.tar.gz` to put one back.
- **Update**: get the new files (`git pull` or copy), then `npm install`, then start again.

The Terminal window has to stay open for the CRM to run. For an always-on server (starts at
boot, survives closing the window) see `deploy/README.md`.

## Optional: settings

Only if you want to change a default. Copy `.env.example` to `.env` and fill in what you need:

```sh
cp .env.example .env
```

| Setting | When |
|---|---|
| `BASE_URL=https://crm.upgrads.de` | The CRM runs under a domain. The boot line, the webhook URL and the admin console's links then show that name. |
| `BACKUP_DIR=/Volumes/Backup/crm-backups` | The daily backups should live on another disk. Recommended. |
| `PORT=4001` | Another port. |
| `NODE_ENV=production` | Under a domain: stricter browser security headers. |

Restart after changing the file.

## If something does not work

| You see | Meaning |
|---|---|
| `node: command not found` | Node.js is not installed, or the Terminal was opened before the install. Install it, open a new Terminal. |
| `Another CRM process (pid …) is already using …/data/pgdata` | The CRM is already running in another window. Use that one, or stop it there first. |
| `EADDRINUSE` / port in use | Something else uses port 4001. Stop it, or set `PORT` in `.env`. |
| Colleagues cannot open the page | Same network? Firewall prompt answered with Allow? Try the IP address instead of the name. |
| `Database init failed` | The data folder is damaged or another process holds it. Restore the last backup: `npm run restore -- backups/<file>.tar.gz`. |

Everything else about the CRM is in `README.md`.
