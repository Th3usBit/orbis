"""Collect, merge and publish the orbis economic calendar.

    python scripts/fetch.py [--days-back 7] [--days-ahead 21]

Pulls every configured source, reconciles them into one deduplicated timeline
and writes data/calendar.json. That file is the only thing the web app reads,
which is what lets orbis run as a static site with no backend and no API key.

Sources are independent: if one is down the run still succeeds, and the failure
is recorded in the output so the UI can be honest about coverage.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sources import forexfactory, holidays, tradingview  # noqa: E402
from sources.classify import slug  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# Two events from different providers are the same release if they share a
# country, land within this many minutes of each other, and their titles are
# similar enough.
MATCH_MINUTES = 45

# Indicator names are long and share most of their characters, so ordinary
# string similarity runs hot: "Unemployment Rate" and "Employment Rate" score
# 0.94, "Exports" and "Imports" 0.71. The threshold is therefore high, and it
# is not trusted on its own -- the period and polarity checks below do the work
# that a ratio cannot.
MATCH_RATIO = 0.90

# The window a release can be reported in by two feeds spans midnight UTC for
# Asia-Pacific countries, whose releases cluster around 23:00-01:00 UTC. Buckets
# are keyed by UTC date, so neighbours have to be consulted too.
ADJACENT_DAYS = (-1, 0, 1)

# "CPI MoM" and "CPI YoY" are different releases with near-identical names. The
# period is the distinguishing part, so two rows whose periods disagree are
# never the same event however similar the rest reads.
PERIOD_MARKERS = {
    "mom": "mom", "m/m": "mom", "monthly": "mom",
    "qoq": "qoq", "q/q": "qoq", "quarterly": "qoq",
    "yoy": "yoy", "y/y": "yoy", "annual": "yoy", "yearly": "yoy",
    "wow": "wow", "w/w": "wow", "weekly": "wow",
}

# Likewise for opposites that differ by one short word.
POLARITY_MARKERS = (
    ("export", "import"),
    ("unemploy", "employ"),
    ("initial", "continuing"),
    ("prelim", "final"),
    ("core", None),
)


class Window:
    """The inclusive UTC time range a run collects."""

    def __init__(self, days_back: int, days_ahead: int):
        midnight = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        self.start = midnight - timedelta(days=days_back)
        self.end = midnight + timedelta(days=days_ahead)

    def contains(self, iso: str) -> bool:
        moment = parse(iso)
        return moment is not None and self.start <= moment <= self.end

    def as_dict(self) -> dict:
        return {
            "from": self.start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "to": self.end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }


def parse(iso: str) -> datetime | None:
    """A feed timestamp as an aware UTC datetime, or None if it is not one.

    Always aware, never naive. A value carrying no zone -- a bare '2026-09-14',
    which fromisoformat accepts -- comes back naive, and Python refuses to
    compare naive against aware: `window.contains()` would raise TypeError
    rather than return False, and the run would die on a single malformed row
    instead of dropping it. The three collectors all emit a full ISO stamp
    today, so this is a guard on input we do not control, not a live bug.
    """
    try:
        moment = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError, TypeError):
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def load_countries() -> tuple[dict, dict]:
    with open(os.path.join(DATA, "countries.json"), encoding="utf-8") as handle:
        reference = json.load(handle)
    return reference["countries"], reference["currencies"]


def period_of(title: str) -> str | None:
    """The reporting period a title declares, if any: mom / qoq / yoy / wow."""
    lowered = f" {title.lower()} "
    for marker, period in PERIOD_MARKERS.items():
        if f" {marker} " in lowered or f" {marker}." in lowered or lowered.endswith(f" {marker} "):
            return period
    # Suffixes often arrive glued to punctuation rather than spaced.
    compact = "".join(ch for ch in title.lower() if ch.isalnum() or ch == "/")
    for marker, period in PERIOD_MARKERS.items():
        if compact.endswith(marker.replace("/", "")):
            return period
    return None


def comparable(a: dict, b: dict) -> bool:
    """Whether two rows can be the same release at all, before scoring them.

    Cheap, decisive checks that a similarity ratio gets wrong: the two feeds
    must agree on the reporting period, must not be opposite sides of the same
    pair, and must not report values an order of magnitude apart -- an index
    level against a percentage change is never one release.
    """
    period_a, period_b = period_of(a["title"]), period_of(b["title"])
    if period_a and period_b and period_a != period_b:
        return False

    lower_a, lower_b = a["title"].lower(), b["title"].lower()
    for left, right in POLARITY_MARKERS:
        if right is None:
            if (left in lower_a) != (left in lower_b):
                return False
        elif (left in lower_a and right in lower_b) or (right in lower_a and left in lower_b):
            return False

    # An index level (~330) and a percentage change (~0.4) are not the same
    # number reported twice, however alike the titles read.
    for field in ("previous", "actual"):
        x, y = a.get(field), b.get(field)
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            big, small = max(abs(x), abs(y)), min(abs(x), abs(y))
            if small > 0 and big / small > 20:
                return False
    return True


def merge(primary: list[dict], secondary: list[dict]) -> tuple[list[dict], int]:
    """Fold the secondary feed into the primary one.

    Matching events are not duplicated: the primary row is kept and tagged as
    corroborated. Unmatched secondary rows are appended as genuine additions.
    """
    by_country_day: dict[tuple[str, str], list[dict]] = {}
    for event in primary:
        key = (event["country"], event["ts"][:10])
        by_country_day.setdefault(key, []).append(event)

    merged = list(primary)
    confirmed = 0
    # A primary row corroborates at most one secondary row. Without this, several
    # near-identical candidates collapse onto the same match and every one after
    # the first is dropped -- the events simply vanish from the output.
    claimed: set[int] = set()

    for candidate in secondary:
        moment = parse(candidate["ts"])
        if moment is None:
            merged.append(candidate)
            continue

        neighbours: list[dict] = []
        for offset in ADJACENT_DAYS:
            day = (moment + timedelta(days=offset)).strftime("%Y-%m-%d")
            neighbours.extend(by_country_day.get((candidate["country"], day), []))

        # Score every plausible neighbour and take the best, rather than the
        # first to clear the bar: iteration order is feed order, which is
        # arbitrary, and the first match is often not the right one.
        best, best_ratio = None, 0.0
        for existing in neighbours:
            if id(existing) in claimed:
                continue
            other = parse(existing["ts"])
            if other is None:
                continue
            if abs((moment - other).total_seconds()) > MATCH_MINUTES * 60:
                continue
            if not comparable(candidate, existing):
                continue
            ratio = SequenceMatcher(
                None, slug(candidate["title"]), slug(existing["title"])
            ).ratio()
            if ratio >= MATCH_RATIO and ratio > best_ratio:
                best, best_ratio = existing, ratio

        match = best
        if match is not None:
            claimed.add(id(match))

        if match:
            sources = set(match.get("confirmed_by") or [])
            sources.add(candidate["source"])
            match["confirmed_by"] = sorted(sources)
            # The corroborating feed sometimes carries a forecast the primary lacks.
            for field in ("forecast", "previous"):
                if match.get(field) is None and candidate.get(field) is not None:
                    match[field] = candidate[field]
            confirmed += 1
        else:
            merged.append(candidate)

    return merged, confirmed


def collect(window: Window, countries: dict, currencies: dict) -> tuple[list[dict], list[dict]]:
    codes = sorted(countries.keys())
    report: list[dict] = []

    def run(module, label, call):
        try:
            rows = call()
            report.append({
                "id": module.ID, "name": module.NAME, "url": module.HOMEPAGE,
                "role": label, "events": len(rows), "ok": True,
            })
            print(f"  {module.ID:<14} {len(rows):>5} events")
            return rows
        except Exception as error:  # noqa: BLE001 - one bad source must not fail the run
            report.append({
                "id": module.ID, "name": module.NAME, "url": module.HOMEPAGE,
                "role": label, "events": 0, "ok": False, "error": str(error)[:200],
            })
            print(f"  {module.ID:<14} FAILED: {error}", file=sys.stderr)
            return []

    print("Collecting sources...")
    primary = run(tradingview, "primary", lambda: tradingview.fetch(window, codes))
    secondary = run(forexfactory, "cross-check", lambda: forexfactory.fetch(window, currencies))
    closures = run(holidays, "context", lambda: holidays.fetch(window, set(codes)))

    events, confirmed = merge(primary, secondary)
    print(f"  reconciled     {confirmed:>5} events corroborated by both feeds")

    events.extend(closures)
    events = [event for event in events if window.contains(event["ts"])]
    events.sort(key=lambda event: (event["ts"], -event["impact"], event["country"]))

    return events, report


def summarize(events: list[dict]) -> dict:
    by_impact: dict[str, int] = {}
    by_category: dict[str, int] = {}
    countries: set[str] = set()

    for event in events:
        key = str(event["impact"])
        by_impact[key] = by_impact.get(key, 0) + 1
        by_category[event["category"]] = by_category.get(event["category"], 0) + 1
        countries.add(event["country"])

    return {
        "total": len(events),
        "countries": len(countries),
        "by_impact": by_impact,
        "by_category": dict(sorted(by_category.items(), key=lambda kv: -kv[1])),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the orbis economic calendar dataset.")
    parser.add_argument("--days-back", type=int, default=7)
    parser.add_argument("--days-ahead", type=int, default=21)
    parser.add_argument("--out", default=os.path.join(DATA, "calendar.json"))
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="Publish even when the primary source failed. Off by default:"
             " see the comment on partial runs in main().",
    )
    args = parser.parse_args()

    window = Window(args.days_back, args.days_ahead)
    countries, currencies = load_countries()

    print(f"orbis window: {window.as_dict()['from']} -> {window.as_dict()['to']}")
    events, report = collect(window, countries, currencies)

    if not events:
        # Every source failed. Almost always the network; say so, because the
        # per-source errors above scroll past and mean little on a first run.
        print("\n  No events collected from any source.", file=sys.stderr)
        print("  Existing data left untouched.", file=sys.stderr)
        if not any(entry["ok"] for entry in report):
            print("  Every source failed to respond - check your internet"
                  " connection, proxy or firewall.", file=sys.stderr)
        return 1

    # A partial run is the dangerous one, because it looks like a good run.
    #
    # The primary feed carries ~96% of the calendar; the cross-check and the
    # holiday feed together carry the rest. So when the primary alone fails,
    # `events` is not empty -- it is about 90 rows instead of 1900 -- and every
    # check downstream passes: the collector exits 0, the tests assert only
    # that events exist, and the deploy publishes a calendar that has quietly
    # lost nineteen releases in twenty. Refusing to publish is the honest
    # outcome: a stale calendar with a known date beats a current-looking one
    # that is missing almost everything.
    #
    # Keyed on the declared role rather than on a source name, so a fork that
    # swaps its primary feed inherits the guard without editing this.
    failed_primary = [s for s in report if s["role"] == "primary" and not s["ok"]]
    if failed_primary and not args.allow_partial:
        for source in failed_primary:
            print(f"\n  The primary source ({source['id']}) failed: "
                  f"{source.get('error', 'unknown error')}", file=sys.stderr)
        kept = sum(s["events"] for s in report if s["ok"])
        print(f"  Only {kept} events came from the remaining sources, against"
              f" the ~1800 a full run collects.", file=sys.stderr)
        print("  Refusing to publish a calendar that is missing most of its"
              " events; existing data left untouched.", file=sys.stderr)
        print("  Re-run when the source is back, or pass --allow-partial to"
              " publish anyway.", file=sys.stderr)
        return 1

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": window.as_dict(),
        "sources": report,
        "stats": summarize(events),
        # Empty fields are dropped rather than serialized as null: at ~1800
        # events that is a third of the payload the browser would download.
        "events": [{k: v for k, v in event.items() if v is not None} for event in events],
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(args.out) / 1024
    stats = payload["stats"]
    print(
        f"\nWrote {os.path.relpath(args.out, ROOT)} - "
        f"{stats['total']} events across {stats['countries']} countries ({size:.0f} KB)"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
