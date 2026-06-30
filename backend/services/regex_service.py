import re
from typing import List, Dict, Any

# ---------------------------------------------------------------------------
# Precompiled regex patterns — each runs one pass over the input string.
# Patterns are ordered from most-specific to least-specific so that the
# overlap-pruning step keeps the better match when two patterns fire on
# overlapping ranges (e.g. a credit card inside a longer numeric string).
#
# Time complexity: O(N · P) where N = document length, P = number of patterns
# (P is constant ≈ 12, so effectively O(N) per call).
# Space: O(M) where M = number of matches (small, typically tens not thousands).
# ---------------------------------------------------------------------------

_PATTERNS: List[Dict[str, Any]] = [
    # ── Credit / Debit card numbers ────────────────────────────────────────
    # Luhn-plausible 16-digit groups (4-4-4-4), optionally space or dash separated.
    # Must be preceded/followed by a non-digit boundary to avoid matching longer runs.
    {
        "type": "credit_card",
        "confidence": 0.99,
        "systemCritical": True,
        "pattern": re.compile(
            r"(?<!\d)"
            r"(?:4[0-9]{3}|5[1-5][0-9]{2}|2[2-7][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2}))"
            r"(?:[ \-]?[0-9]{4}){3}"
            r"(?!\d)",
        ),
    },
    # ── Social Security Numbers (US) ───────────────────────────────────────
    # Format: NNN-NN-NNNN or NNN NN NNNN. Reject 000, 666, 900-999 area codes.
    {
        "type": "ssn",
        "confidence": 0.99,
        "systemCritical": True,
        "pattern": re.compile(
            r"(?<!\d)"
            r"(?!000|666|9\d{2})\d{3}"
            r"[- ]"
            r"(?!00)\d{2}"
            r"[- ]"
            r"(?!0000)\d{4}"
            r"(?!\d)",
        ),
    },
    # ── IBAN ───────────────────────────────────────────────────────────────
    {
        "type": "iban",
        "confidence": 0.97,
        "systemCritical": True,
        "pattern": re.compile(
            r"\b[A-Z]{2}[0-9]{2}(?:[ ]?[A-Z0-9]{4}){4}(?:[ ]?[A-Z0-9]{1,2})?\b"
        ),
    },
    # ── Email addresses ────────────────────────────────────────────────────
    # RFC-5321 simplified; rejects obvious non-emails like version strings.
    {
        "type": "email",
        "confidence": 0.99,
        "systemCritical": True,
        "pattern": re.compile(
            r"(?<!\w)"
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
            r"(?!\w)",
        ),
    },
    # ── Phone numbers ──────────────────────────────────────────────────────
    # Handles many formats: +91-98765-43210, (098) 765-4321, 9876543210, etc.
    # Requires ≥7 digits (prevents 4-digit room/ext numbers matching).
    {
        "type": "phone",
        "confidence": 0.97,
        "systemCritical": True,
        "pattern": re.compile(
            r"(?<!\d)"
            r"(?:\+?(\d{1,3})[-.\s]?)?"            # optional country code
            r"(?:\(?\d{2,4}\)?[-.\s]?)?"            # optional area code
            r"\d{3,5}"                              # central digits
            r"[-.\s]?\d{3,5}"                       # subscriber number
            r"(?!\d)",
        ),
    },
    # ── Passport numbers (generic: letter(s) + 6–9 digits) ────────────────
    {
        "type": "passport",
        "confidence": 0.85,
        "systemCritical": True,
        "pattern": re.compile(r"\b[A-Z]{1,2}[0-9]{6,9}\b"),
    },
    # ── IP addresses ───────────────────────────────────────────────────────
    {
        "type": "ip_address",
        "confidence": 0.95,
        "systemCritical": False,
        "pattern": re.compile(
            r"(?<!\d)"
            r"(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}"
            r"(?:25[0-5]|2[0-4]\d|[01]?\d\d?)"
            r"(?!\d)",
        ),
    },
    # ── Dates of birth / sensitive dates ──────────────────────────────────
    # Formats: DD/MM/YYYY, MM-DD-YYYY, YYYY-MM-DD
    {
        "type": "date",
        "confidence": 0.80,
        "systemCritical": False,
        "pattern": re.compile(
            r"\b(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b"
        ),
    },
]


def _prune_overlaps(matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Linear sweep to remove overlapping spans.
    - Sort by startIndex, then by descending span length (longest/best first).
    - Keep a span only if its start is >= the end of the last kept span.
    O(M log M) sort + O(M) sweep where M = total raw matches (tiny).
    """
    if not matches:
        return []
    matches.sort(key=lambda m: (m["startIndex"], -(m["endIndex"] - m["startIndex"])))
    result: List[Dict[str, Any]] = []
    last_end = -1
    for m in matches:
        if m["startIndex"] >= last_end:
            result.append(m)
            last_end = m["endIndex"]
    return result


def run_regex_pass(text: str) -> List[Dict[str, Any]]:
    """
    Run all precompiled patterns over `text` in a single scan per pattern.
    Returns a deduplicated, sorted list of match dicts ready for schema conversion.
    """
    raw_matches: List[Dict[str, Any]] = []

    for p in _PATTERNS:
        for m in p["pattern"].finditer(text):
            # Extra guard: skip purely-digit sequences that are clearly not phone
            # numbers (e.g. zip codes, product codes: exactly 4 or 5 plain digits).
            if p["type"] == "phone":
                digits_only = re.sub(r"\D", "", m.group())
                if len(digits_only) < 7:
                    continue

            raw_matches.append(
                {
                    "startIndex": m.start(),
                    "endIndex": m.end(),
                    "text": m.group(),
                    "type": p["type"],
                    "source": "regex",
                    "confidence": p["confidence"],
                    "systemCritical": p["systemCritical"],
                    "status": "suggested",
                }
            )

    return _prune_overlaps(raw_matches)
