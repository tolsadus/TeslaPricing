#!/usr/bin/env bash
# Launch the TeslaPricing frontend (Vite) in dev mode.
# Ctrl+C stops it cleanly.
#
# Options:
#   --scrape-first [source]   Run the scraper once before starting.
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
FRONTEND_DIR="$ROOT_DIR/frontend"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Frontend node_modules not found."
  echo "Run: cd frontend && npm install"
  exit 1
fi

if [ -n "$SCRAPE_FIRST" ]; then
  echo "→ Scraping $SCRAPE_SOURCE once before starting..."
  "$ROOT_DIR/scrape.sh" "$SCRAPE_SOURCE"
  echo ""
fi

cleanup() {
  echo ""
  echo "Shutting down..."
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ Starting frontend on http://localhost:5173"
cd "$FRONTEND_DIR"
exec npm run dev
