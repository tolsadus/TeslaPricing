#!/usr/bin/env bash
# Launch the Crawsla backend (FastAPI) and frontend (Vite) together.
# Ctrl+C stops both cleanly.
#
# Options:
#   --scrape-first [source]   Run the scraper once before starting servers.
#                             Source defaults to "leboncoin".

set -e

SCRAPE_FIRST=""
SCRAPE_SOURCE="leboncoin"
while [ $# -gt 0 ]; do
  case "$1" in
    --scrape-first)
      SCRAPE_FIRST=1
      if [ -n "$2" ] && [[ "$2" != --* ]]; then
        SCRAPE_SOURCE="$2"
        shift
      fi
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
  echo "Backend venv not found at $VENV_DIR"
  echo "Run: cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -e . && playwright install chromium"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Frontend node_modules not found."
  echo "Run: cd frontend && npm install"
  exit 1
fi

if [ -n "$SCRAPE_FIRST" ]; then
  echo "→ Scraping $SCRAPE_SOURCE once before starting servers..."
  "$ROOT_DIR/scrape.sh" "$SCRAPE_SOURCE"
  echo ""
fi

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ Starting backend on http://localhost:8000"
(
  cd "$BACKEND_DIR"
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  exec uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &
BACKEND_PID=$!

echo "→ Starting frontend on http://localhost:5173"
(
  cd "$FRONTEND_DIR"
  exec npm run dev
) &
FRONTEND_PID=$!

echo ""
echo "Press Ctrl+C to stop both."
wait
