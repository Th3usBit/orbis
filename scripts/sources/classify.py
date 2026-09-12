"""Classify raw calendar rows into stable, source-independent buckets.

Providers disagree about categories (and some omit them entirely), so orbis
derives its own from the event title. Keeping this in one place means the globe,
the filters and the legend all speak the same vocabulary.
"""

from __future__ import annotations

import re

# Ordered: the first bucket whose pattern matches wins, so put the specific
# and high-signal buckets (policy decisions, speeches) above the generic ones.
CATEGORY_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("speech", (
        "speaks", "speech", "testimony", "press conference", "remarks",
        "member ", "governor", "chair ", "chairman", "president ",
    )),
    ("rates", (
        "interest rate", "rate decision", "rate statement", "fomc", "policy rate",
        "monetary policy", "repo rate", "selic", "cash rate", "bank rate",
        "refinancing rate", "deposit facility", "marginal lending", "rate vote",
        "policy meeting", "minutes", "copom", "boe ", "boj ", "ecb ", "snb ",
    )),
    ("inflation", (
        "cpi", "inflation", "ppi", "price index", "hicp", "deflator",
        "pce price", "price growth", "wpi", "core prices", "rpi",
    )),
    ("labor", (
        "employment", "unemployment", "payroll", "jobless", "job ", "jobs",
        "wage", "labour", "labor", "claimant", "average earnings", "vacancies",
    )),
    ("sentiment", (
        "pmi", "confidence", "sentiment", "zew", "ifo", "ism", "expectations",
        "survey", "optimism", "climate", "tankan", "outlook",
    )),
    ("growth", (
        "gdp", "industrial production", "retail sales", "manufacturing production",
        "economic activity", "capacity utilization", "factory orders",
        "machine orders", "durable goods", "business investment", "output",
    )),
    ("trade", (
        "trade balance", "exports", "imports", "current account", "capital flows",
        "tariff", "terms of trade", "foreign investment",
    )),
    ("housing", (
        "housing", "home sales", "building permits", "mortgage", "construction",
        "house price", "hpi", "building approvals",
    )),
    ("fiscal", (
        "budget", "deficit", "public sector", "government spending", "fiscal",
        "debt to gdp", "borrowing",
    )),
    ("energy", (
        "crude oil", "oil inventories", "natural gas", "opec", "rig count",
        "gasoline", "petroleum", "eia ",
    )),
    ("bonds", (
        "auction", "bond", "bill yield", "note yield", "yield", "t-bill",
    )),
    ("money", (
        "money supply", "m1", "m2", "m3", "loan growth", "private credit",
        "bank lending", "reserves", "foreign currency reserves",
    )),
]

_WORD_SPLIT = re.compile(r"[^a-z0-9]+")


def categorize(title: str, indicator: str = "") -> str:
    """Map an event title to one of the orbis categories."""
    haystack = f" {title} {indicator} ".lower()

    for name, needles in CATEGORY_PATTERNS:
        for needle in needles:
            if needle in haystack:
                return name

    return "other"


def slug(text: str) -> str:
    """Normalize a title for cross-source deduplication."""
    return "-".join(part for part in _WORD_SPLIT.split(text.lower()) if part)


def to_number(value) -> float | None:
    """Parse the loosely-typed actual/forecast/previous fields providers emit.

    Handles '3.2%', '-1.4K', '215B', '1,234.5' and empty strings, all of which
    show up in the free feeds.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return _finite(float(value))

    text = str(value).strip().replace("%", "")
    if not text or text.lower() in {"-", "--", "n/a", "nan", "inf", "-inf", "infinity"}:
        return None

    multiplier = 1.0
    if text[-1:].upper() in {"K", "M", "B", "T"}:
        multiplier = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[text[-1].upper()]
        text = text[:-1]

    text = _decimal_point(text)

    try:
        return _finite(float(text) * multiplier)
    except (ValueError, OverflowError):
        return None


def _decimal_point(text: str) -> str:
    """Normalise thousands and decimal separators to a plain float literal.

    The feeds are not consistent: '1,234.5' is Anglo, '1.234,5' is European and
    means the same number, and a bare '5,5' is 5.5 rather than 55. Stripping
    every comma -- which is what this used to do -- turns that last one into a
    value ten times too large, silently.
    """
    if "," in text and "." in text:
        # Whichever separator comes last is the decimal one.
        if text.rfind(",") > text.rfind("."):
            return text.replace(".", "").replace(",", ".")
        return text.replace(",", "")

    if "," in text:
        head, _, tail = text.rpartition(",")
        # Exactly three digits after a single comma is ambiguous ('1,234'), and
        # thousands is the overwhelmingly more common intent in these feeds.
        if len(tail) == 3 and head.count(",") == 0 and tail.isdigit():
            return text.replace(",", "")
        return text.replace(",", ".") if text.count(",") == 1 else text.replace(",", "")

    return text


def _finite(number: float) -> float | None:
    """Drop NaN and infinities.

    json.dump writes these as the bare literals NaN and Infinity, which no
    JSON parser accepts: one such value in the feed would make calendar.json
    unparseable and take the whole page down with it.
    """
    return number if number == number and number not in (float("inf"), float("-inf")) else None
