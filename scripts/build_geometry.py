"""
Build the 3D globe geometry assets from Natural Earth data (public domain).

Downloads world-atlas TopoJSON, decodes it with the standard library only, and
emits two compact assets consumed by the WebGL globe:

  assets/land-dots.json   equal-area dot matrix covering land masses
  assets/borders.json     simplified country outlines as polylines

Run once (or whenever you want a different dot density):

    python scripts/build_geometry.py

Source: https://github.com/topojson/world-atlas (Natural Earth 110m, public domain)
"""

from __future__ import annotations

import json
import math
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")

LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json"
COUNTRIES_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

# Angular spacing between dots, in degrees of great circle. Lower = denser globe.
DOT_SPACING_DEG = 1.15


# --------------------------------------------------------------------------
# TopoJSON decoding (no third-party dependencies)
# --------------------------------------------------------------------------

def _decode_arcs(topology: dict) -> list[list[list[float]]]:
    """Undo quantization + delta encoding, returning arcs in lon/lat degrees."""
    transform = topology.get("transform")
    arcs: list[list[list[float]]] = []

    for arc in topology["arcs"]:
        points: list[list[float]] = []
        x = y = 0
        for dx, dy in arc:
            if transform:
                x += dx
                y += dy
                points.append([
                    x * transform["scale"][0] + transform["translate"][0],
                    y * transform["scale"][1] + transform["translate"][1],
                ])
            else:
                points.append([dx, dy])
        arcs.append(points)

    return arcs


def _stitch(arc_indexes: list[int], arcs: list[list[list[float]]]) -> list[list[float]]:
    """Join a ring's arc references into a single coordinate list."""
    ring: list[list[float]] = []
    for index in arc_indexes:
        if index < 0:
            # Negative index means "traverse this arc backwards" (~index).
            segment = arcs[~index][::-1]
        else:
            segment = arcs[index]
        # Drop the duplicated joint between consecutive arcs.
        ring.extend(segment[1:] if ring else segment)
    return ring


def topo_to_polygons(topology: dict, object_name: str):
    """Yield (properties, list_of_rings) for every geometry in an object."""
    arcs = _decode_arcs(topology)

    for geometry in topology["objects"][object_name]["geometries"]:
        kind = geometry.get("type")
        props = dict(geometry.get("properties") or {})
        props["id"] = geometry.get("id")

        if kind == "Polygon":
            yield props, [_stitch(ring, arcs) for ring in geometry["arcs"]]
        elif kind == "MultiPolygon":
            for polygon in geometry["arcs"]:
                yield props, [_stitch(ring, arcs) for ring in polygon]


# --------------------------------------------------------------------------
# Point in polygon
# --------------------------------------------------------------------------

def _bbox(rings: list[list[list[float]]]) -> tuple[float, float, float, float]:
    xs = [p[0] for ring in rings for p in ring]
    ys = [p[1] for ring in rings for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def _inside(lon: float, lat: float, rings: list[list[list[float]]]) -> bool:
    """Even-odd ray casting across every ring, so holes subtract correctly."""
    crossings = 0
    for ring in rings:
        count = len(ring)
        for i in range(count):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % count]
            if (y1 > lat) != (y2 > lat):
                t = (lat - y1) / (y2 - y1)
                if lon < x1 + t * (x2 - x1):
                    crossings += 1
    return crossings % 2 == 1


# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------

def build_land_dots(topology: dict) -> dict:
    """Equal-area dot matrix: dots per row scale with cos(latitude)."""
    polygons = [(rings, _bbox(rings)) for _, rings in topo_to_polygons(topology, "land")]
    print(f"  land polygons: {len(polygons)}")

    lons: list[int] = []
    lats: list[int] = []
    rows = int(180 / DOT_SPACING_DEG)

    for row in range(rows + 1):
        lat = -90 + row * DOT_SPACING_DEG
        if lat <= -84 or lat >= 84:
            continue  # Skip the poles: Antarctica dominates and adds no signal.

        circumference = math.cos(math.radians(lat))
        columns = max(1, int(round(360 / DOT_SPACING_DEG * circumference)))

        for col in range(columns):
            lon = -180 + col * (360 / columns)
            for rings, (minx, miny, maxx, maxy) in polygons:
                if minx <= lon <= maxx and miny <= lat <= maxy and _inside(lon, lat, rings):
                    lons.append(round(lon * 100))
                    lats.append(round(lat * 100))
                    break

    print(f"  land dots: {len(lons)}")
    # Parallel int arrays scaled by 100 keep the payload small and gzip well.
    return {"scale": 100, "lon": lons, "lat": lats}


def build_borders(topology: dict) -> dict:
    """Country outlines as flat polylines, deduplicated and coarsely simplified."""
    lines: list[list[int]] = []
    seen: set[tuple] = set()

    for _, rings in topo_to_polygons(topology, "countries"):
        for ring in rings:
            if len(ring) < 3:
                continue

            flat: list[int] = []
            last: tuple[int, int] | None = None
            for lon, lat in ring:
                point = (round(lon * 50), round(lat * 50))  # ~0.02 deg grid
                if point != last:
                    flat.extend(point)
                    last = point

            if len(flat) < 6:
                continue

            key = (flat[0], flat[1], len(flat))
            if key in seen:
                continue
            seen.add(key)
            lines.append(flat)

    print(f"  border rings: {len(lines)}")
    return {"scale": 50, "lines": lines}


def fetch_json(url: str) -> dict:
    print(f"  GET {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "orbis-geometry-builder"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    os.makedirs(ASSETS, exist_ok=True)

    print("Building land dot matrix...")
    land_dots = build_land_dots(fetch_json(LAND_URL))

    print("Building country borders...")
    borders = build_borders(fetch_json(COUNTRIES_URL))

    for name, payload in (("land-dots.json", land_dots), ("borders.json", borders)):
        path = os.path.join(ASSETS, name)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        print(f"  wrote {name} ({os.path.getsize(path) / 1024:.0f} KB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
