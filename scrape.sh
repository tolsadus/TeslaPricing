#!/usr/bin/env bash
# Run a scraper without having to activate the venv manually.
# Usage:
#   ./scrape.sh leboncoin --pages 2
#   ./scrape.sh lacentrale --debug
#   ./scrape.sh tesla
#   ./scrape.sh tesla --models m3,my

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
  echo "Backend venv not found at $VENV_DIR"
  echo "Run: cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -e . && playwright install chromium"
  exit 1
fi

if [ $# -eq 0 ]; then
  echo "Usage: $0 <source> [options]"
  echo "Sources: leboncoin, lacentrale, gmecars, mobile-de, tesla, capcar"
  exit 1
fi

cd "$BACKEND_DIR"
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
exec python3 -m scraper.run "$@"
