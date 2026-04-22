#!/usr/bin/env bash
# Run a scraper.
# Usage:
#   ./scrape.sh tesla
#   ./scrape.sh tesla --models m3,my
#   ./scrape.sh capcar --pages 10
#   ./scrape.sh gmecars --pages 1
#   ./scrape.sh leboncoin --pages 1
#   ./scrape.sh aramisauto
#   ./scrape.sh renew

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <source> [options]"
  echo "Sources: tesla, capcar, gmecars, leboncoin, aramisauto, renew"
  exit 1
fi

cd "$BACKEND_DIR"
exec node scraper/cli.js "$@"
