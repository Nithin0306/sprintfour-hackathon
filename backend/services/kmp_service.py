"""
kmp_service.py — KMP-based string matching utilities for PII redaction.

Provides four modular functions:
  1. clean_entity()      — Strip LLM noise, titles, and quotes from raw entity text.
  2. build_lps()         — Build the KMP Longest Proper Suffix (LPS) table.
  3. kmp_search()        — Find all case-insensitive occurrences of a pattern (O(n+m)).
  4. kmp_find_all_spans() — Convert KMP match positions into {startIndex, endIndex} dicts.
"""

import re
from typing import List, Tuple, Dict, Any


# ---------------------------------------------------------------------------
# Step 1: Cleaner
# ---------------------------------------------------------------------------

# Honorific prefixes to strip before matching, so "Dr. Arjun Iyer" correctly
# matches the pattern "Arjun Iyer" in the document.
_TITLE_PREFIXES = re.compile(
    r"^(Dr|Mr|Mrs|Ms|Miss|Prof|Mx|Capt|Col|Gen|Sgt|Rev|Fr|Sr|Jr|Esq)\.\s*",
    re.IGNORECASE,
)

# LLM filler patterns — things the model sometimes prepends before the real value.
_FILLER_PATTERN = re.compile(
    r"^(llm returned\s+(?:non-json\s+)?output\s*:?\s*|"
    r"i found\s*:?\s*|"
    r"entity\s*:?\s*|"
    r"result\s*:?\s*)",
    re.IGNORECASE,
)


def clean_entity(raw: str) -> str:
    """
    Sanitize a messy LLM entity string into a clean, matchable name.

    Pipeline:
      1. Strip surrounding whitespace and outer quotes.
      2. Remove LLM conversational filler.
      3. Remove honorific title prefixes (Dr., Mr., etc.).
      4. Strip any remaining whitespace.

    Examples:
      'LLM returned non-JSON output: "Arjun Iyer"' → 'Arjun Iyer'
      '"Dr. Arjun Iyer"'                           → 'Arjun Iyer'
      '"Priya Sharma"'                              → 'Priya Sharma'
    """
    if not isinstance(raw, str):
        return ""

    text = raw.strip()

    # Remove outer quotes (single, double, curly)
    text = re.sub(r'^["\'\u201c\u201d]+|["\'\u201c\u201d]+$', "", text).strip()

    # Remove LLM filler prefix
    text = _FILLER_PATTERN.sub("", text).strip()

    # Remove outer quotes again (filler may have been before the quotes)
    text = re.sub(r'^["\'\u201c\u201d]+|["\'\u201c\u201d]+$', "", text).strip()

    # Remove honorific title prefixes
    text = _TITLE_PREFIXES.sub("", text).strip()

    return text


# ---------------------------------------------------------------------------
# Step 2: LPS (Longest Proper Suffix) table builder
# ---------------------------------------------------------------------------

def build_lps(pattern: str) -> List[int]:
    """
    Build the KMP Longest Proper Prefix which is also Suffix (LPS) array.

    lps[i] = length of the longest proper prefix of pattern[0..i] that is
             also a suffix.

    Time: O(m), Space: O(m) where m = len(pattern).

    Args:
        pattern: The pattern string (should already be lowercased for case-insensitive search).

    Returns:
        The LPS array of the same length as pattern.
    """
    m = len(pattern)
    lps = [0] * m
    # `length` tracks the length of the previous longest proper prefix suffix.
    length = 0
    i = 1  # lps[0] is always 0; start from index 1

    while i < m:
        if pattern[i] == pattern[length]:
            # Characters match — extend the current prefix-suffix
            length += 1
            lps[i] = length
            i += 1
        else:
            if length != 0:
                # Fall back to the previous longest prefix-suffix via the LPS table itself.
                # This avoids re-comparing characters we already know match.
                length = lps[length - 1]
                # Do NOT increment i here — we retry matching from the new `length`.
            else:
                # No proper prefix-suffix exists at this position
                lps[i] = 0
                i += 1

    return lps


# ---------------------------------------------------------------------------
# Step 3: KMP Searcher
# ---------------------------------------------------------------------------

def kmp_search(text: str, pattern: str) -> List[int]:
    """
    Find all starting positions of `pattern` in `text` using KMP.

    - Case-insensitive: both text and pattern are lowercased for comparison,
      but returned positions reference the ORIGINAL text indices.
    - Time: O(n + m) where n = len(text), m = len(pattern).

    Args:
        text:    The haystack document string.
        pattern: The needle to find.

    Returns:
        A list of starting character indices in `text` where `pattern` occurs.
    """
    if not pattern or not text:
        return []

    n = len(text)
    m = len(pattern)

    # Lowercase both for case-insensitive matching
    text_lower = text.lower()
    pattern_lower = pattern.lower()

    lps = build_lps(pattern_lower)
    matches: List[int] = []

    i = 0  # index into text
    j = 0  # index into pattern

    while i < n:
        if text_lower[i] == pattern_lower[j]:
            i += 1
            j += 1
        # A full match is found
        if j == m:
            matches.append(i - j)  # start index in original text
            # Use LPS to look for the next possible match without backtracking
            j = lps[j - 1]
        elif i < n and text_lower[i] != pattern_lower[j]:
            if j != 0:
                # Fall back using the LPS table — skip already-matched characters
                j = lps[j - 1]
            else:
                # No prefix matched at all — advance through text
                i += 1

    return matches


# ---------------------------------------------------------------------------
# Step 4: KMP Find All Spans
# ---------------------------------------------------------------------------

def kmp_find_all_spans(
    text: str,
    entity_text: str,
    entity_type: str,
    confidence: float,
    system_critical: bool,
) -> List[Dict[str, Any]]:
    """
    Use KMP to find every occurrence of `entity_text` in `text` and return
    span dicts compatible with the rest of the detection pipeline.

    Args:
        text:            The full document string.
        entity_text:     The clean entity string to search for.
        entity_type:     PII type (e.g. "person_name").
        confidence:      The confidence score from the upstream layer.
        system_critical: Whether this span is system-critical.

    Returns:
        List of span dicts, each with startIndex, endIndex, text, type, source,
        confidence, systemCritical, and status fields.
    """
    positions = kmp_search(text, entity_text)
    spans = []
    m = len(entity_text)

    for start in positions:
        # Recover the ORIGINAL casing substring from the document.
        # KMP search is case-insensitive, so the actual matched text may differ
        # in casing from the pattern — we preserve the original document text.
        original_match = text[start : start + m]
        spans.append({
            "startIndex": start,
            "endIndex": start + m,
            "text": original_match,
            "type": entity_type,
            "source": "string_match",
            "confidence": confidence,
            "systemCritical": system_critical,
            "status": "suggested",
        })

    return spans
