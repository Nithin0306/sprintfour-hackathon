import re
from typing import List, Dict, Any
from services.kmp_service import kmp_find_all_spans


def run_string_match_pass(
    text: str,
    existing_spans: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Layer 3: KMP-based String Propagation.
    Takes all PII strings found by Layer 1 (Regex) and Layer 2 (LLM),
    and uses the KMP algorithm to find EVERY occurrence of those exact strings
    across the whole document — O(n+m) per entity.

    This guarantees:
    - If the LLM catches a name once, we catch it everywhere in the document.
    - We don't waste LLM tokens re-scanning for repeated mentions.
    - Title prefixes (Dr., Mr.) are already stripped upstream in kmp_service.
    """
    known_pii: Dict[str, Dict] = {}

    for span in existing_spans:
        s_text = span["text"]
        if len(s_text) > 3 and s_text not in known_pii:
            known_pii[s_text] = {
                "type": span["type"],
                "confidence": span["confidence"],
                "systemCritical": span["systemCritical"],
            }

    propagated_spans = []
    for pii_str, meta in known_pii.items():
        # KMP search: case-insensitive, O(n+m)
        new_spans = kmp_find_all_spans(
            text=text,
            entity_text=pii_str,
            entity_type=meta["type"],
            confidence=meta["confidence"],
            system_critical=meta["systemCritical"],
        )
        propagated_spans.extend(new_spans)

    return propagated_spans


def merge_and_dedupe(
    regex_spans: List[Dict[str, Any]],
    llm_spans: List[Dict[str, Any]],
    string_match_spans: List[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Combine all layers and resolve overlaps.
    Priority: regex (exact) > string_match (exact) > llm (fuzzy offset).
    """
    if string_match_spans is None:
        string_match_spans = []

    _PRIORITY = {"regex": 2, "string_match": 1, "llm": 0}

    combined = regex_spans + llm_spans + string_match_spans
    
    # Sort by start index. For ties, highest priority wins.
    combined.sort(key=lambda s: (s["startIndex"], -_PRIORITY.get(s["source"], 0)))

    result: List[Dict[str, Any]] = []
    last_end = -1

    for span in combined:
        if span["startIndex"] >= last_end:
            # No overlap — keep it
            result.append(span)
            last_end = span["endIndex"]
        else:
            # Overlap handling
            if result:
                last_kept = result[-1]
                new_priority = _PRIORITY.get(span["source"], 0)
                old_priority = _PRIORITY.get(last_kept["source"], 0)
                
                # If the new overlapping span is strictly higher priority AND 
                # fully covers the exact same area, we swap them.
                if new_priority > old_priority and span["startIndex"] <= last_kept["startIndex"] and span["endIndex"] >= last_kept["endIndex"]:
                    result[-1] = span
                    last_end = span["endIndex"]

    # Final deduplication just in case identical spans sneaked in
    final_result = []
    seen_exact = set()
    for span in result:
        key = f"{span['startIndex']}-{span['endIndex']}"
        if key not in seen_exact:
            seen_exact.add(key)
            final_result.append(span)

    return final_result
