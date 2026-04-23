#!/usr/bin/env bash
# Run a scraper.
# Usage:
#   ./scrape.sh tesla
#   ./scrape.sh tesla --models m3,my
#   ./scrape.sh capcar --pages 10
#   ./scrape.sh gmecars
#   ./scrape.sh leboncoin --pages 1
#   ./scrape.sh aramisauto
#   ./scrape.sh renew
#   ./scrape.sh lbauto
#   ./scrape.sh lacentrale
#   ./scrape.sh lacentrale --headed
#   ./scrape.sh all

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <source> [options]"
  echo "Sources: tesla, capcar, gmecars, leboncoin, aramisauto, renew, lbauto, lacentrale, all"
  exit 1
fi

cd "$BACKEND_DIR"

if [ "$1" = "all" ]; then
  echo "==> Running all scrapers..."
  echo ""
  echo "--- tesla ---"
  node scraper/cli.js tesla
  echo ""
  echo "--- capcar ---"
  node scraper/cli.js capcar
  echo ""
  echo "--- gmecars ---"
  node scraper/cli.js gmecars
  echo ""
  echo "--- leboncoin ---"
  node scraper/cli.js leboncoin
  echo ""
  echo "--- aramisauto ---"
  node scraper/cli.js aramisauto
  echo ""
  echo "--- renew ---"
  node scraper/cli.js renew
  echo ""
  echo "--- lbauto ---"
  node scraper/cli.js lbauto
  echo ""
  echo "--- lacentrale ---"
  node scraper/cli.js lacentrale
  echo ""
  echo "==> All scrapers done."
else
  exec node scraper/cli.js "$@"
fi
