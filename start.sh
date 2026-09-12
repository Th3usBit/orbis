#!/usr/bin/env bash
# orbis - the world economic calendar on a globe
# Linux/macOS counterpart of start.bat. Standard library only, no packages.
set -euo pipefail
cd "$(dirname "$0")"

printf '\n  orbis - the world economic calendar on a globe\n'
printf '  ----------------------------------------------\n\n'

PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then PY="$candidate"; break; fi
done

if [ -z "$PY" ]; then
  echo "  [x] Python 3 was not found on your PATH."
  exit 1
fi

if [ ! -f assets/land-dots.json ]; then
  echo "  [1/3] Building globe geometry (first run only)..."
  "$PY" scripts/build_geometry.py
else
  echo "  [1/3] Globe geometry cached."
fi

if [ "${1:-}" = "offline" ]; then
  echo "  [2/3] Offline mode - using the existing data/calendar.json."
  if [ ! -f data/calendar.json ]; then
    echo "  [x] No cached data. Run ./start.sh once with an internet connection."
    exit 1
  fi
else
  echo "  [2/3] Fetching the latest economic calendar..."
  "$PY" scripts/fetch.py
fi

echo "  [3/3] Starting the local server..."
exec "$PY" scripts/serve.py
