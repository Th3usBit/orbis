#!/usr/bin/env bash
# orbis - the world economic calendar on a globe
# Linux/macOS counterpart of start.bat. Standard library only, no packages.
set -uo pipefail
cd "$(dirname "$0")"

printf '\n  orbis - the world economic calendar on a globe\n'
printf '  ----------------------------------------------\n\n'

# The repository ships no data, so a first run has to reach the network. When
# it cannot, say so in a sentence rather than ending on a Python traceback.
failed() {
  printf '\n  [x] %s\n\n' "$1"
  if [ -f data/calendar.json ] && [ -f assets/land-dots.json ]; then
    printf '      You already have data from a previous run. To use it:\n'
    printf '        ./start.sh offline\n\n'
  else
    printf '      The first run needs an internet connection: it downloads\n'
    printf '      public-domain map data and the economic calendar, neither of\n'
    printf '      which is committed to this repository. Check your connection\n'
    printf '      (and any proxy or firewall) and try again.\n\n'
  fi
  exit 1
}

PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then PY="$candidate"; break; fi
done

if [ -z "$PY" ]; then
  printf '  [x] Python 3 was not found on your PATH.\n'
  printf '      Install it from https://www.python.org/downloads/\n\n'
  exit 1
fi

if [ ! -f assets/land-dots.json ] || [ ! -f assets/borders.json ]; then
  echo "  [1/3] Building globe geometry (first run only)..."
  "$PY" scripts/build_geometry.py || failed "Could not build the globe geometry."
else
  echo "  [1/3] Globe geometry cached."
fi

if [ "${1:-}" = "offline" ]; then
  echo "  [2/3] Offline mode - using the existing data/calendar.json."
  if [ ! -f data/calendar.json ]; then
    printf '\n  [x] There is no cached calendar to serve.\n\n'
    printf '      Run ./start.sh once with an internet connection first.\n\n'
    exit 1
  fi
else
  echo "  [2/3] Fetching the latest economic calendar..."
  "$PY" scripts/fetch.py || failed "Could not collect the calendar."
fi

echo "  [3/3] Starting the local server..."
exec "$PY" scripts/serve.py
