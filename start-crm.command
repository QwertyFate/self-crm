#!/bin/bash
# One click: start the CRM and its Cloudflare tunnel, each in its own Terminal window.
#
#   window 1:  cd ~/Downloads/apps/self-crm && npm run dev
#   window 2:  cloudflared tunnel run --url "http://localhost:3000" mac-pro
#
# Double-click this file in Finder (macOS opens .command files in Terminal). The tunnel window waits
# until the CRM answers on its port, so the tunnel never points at nothing. Whatever is already
# running is left alone, so a second click does no harm.
#
# Change these three lines if the folder, the port or the tunnel's name ever change.
APP_DIR="$HOME/Downloads/apps/self-crm"
PORT=3000
TUNNEL="mac-pro"

say_and_wait() { echo; echo "$1"; echo; read -r -p "Press Enter to close this window. " _; exit 1; }

[ -d "$APP_DIR" ]              || say_and_wait "The CRM folder was not found: $APP_DIR"
[ -f "$APP_DIR/package.json" ] || say_and_wait "No package.json in $APP_DIR, so this is not the CRM folder."

# A double-clicked script starts with a short PATH: add where Homebrew and Node usually live.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v npm >/dev/null         || say_and_wait "npm is not installed (or not on the PATH). Install Node.js first."
command -v cloudflared >/dev/null || say_and_wait "cloudflared is not installed (or not on the PATH). Install it with: brew install cloudflared"

# Open a new Terminal window that runs one command line.
open_window() {
  osascript >/dev/null <<EOF
tell application "Terminal"
  activate
  do script "$1"
end tell
EOF
}

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "The CRM is already running on port $PORT. Left as it is."
else
  echo "Starting the CRM (npm run dev) …"
  open_window "cd '$APP_DIR' && npm run dev"
fi

if pgrep -f "cloudflared tunnel run.*$TUNNEL" >/dev/null 2>&1; then
  echo "The tunnel '$TUNNEL' is already running. Left as it is."
else
  echo "Starting the tunnel '$TUNNEL' …"
  # wait up to ten seconds for the CRM to answer, then start the tunnel either way
  open_window "echo 'Waiting for the CRM on port $PORT …'; for i in \$(seq 1 10); do nc -z localhost $PORT 2>/dev/null && break; sleep 1; done; cloudflared tunnel run --url 'http://localhost:$PORT' $TUNNEL"
fi

echo
echo "Done. The CRM and the tunnel each have their own Terminal window; close a window (or press Ctrl+C in it) to stop that one."
sleep 3
