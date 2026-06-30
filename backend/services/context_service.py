"""
context_service.py — Micro-RAG context check for on-demand PII verification.

New Flow (per user request):
  1. User selects words and builds a queue on the frontend.
  2. User clicks "Run AI Check" — all queued words are sent to /context-check/batch.
  3. Each word gets a focused 30-word context window → single LLM call per word.
  4. Results returned with is_pii verdict, confidence, occurrences.
  5. User approves which ones to redact → KMP redaction applied.
"""

import os
import json
import re
import logging
from typing import Dict, Any, List

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from services.kmp_service import kmp_search, clean_entity

load_dotenv()
logger = logging.getLogger(__name__)

_MODEL = "gemini-3.5-flash"
_WORD_WINDOW = 30
# Increased from 100 to avoid truncated JSON responses
_MAX_OUTPUT_TOKENS = 300

_SYSTEM_PROMPT = """You are a PII classifier. Evaluate ONLY the word/phrase inside [brackets] in the sentence.

RULES:
- person_name: A real individual (patient, doctor, employee). Score 0.9-1.0
- organization: Private clinic/hospital that could identify someone. Score 0.7-0.8
- location: Specific address or private place. Score 0.6-0.8
- not_pii: Generic noun, public brand (Amazon, Google), common city name. Score 0.0-0.3

Return ONLY valid compact JSON on one line, no markdown, no prose:
{"is_pii":true,"type":"person_name","confidence":0.95,"reason":"Patient name in medical record"}"""


def _build_context_window(text: str, selection: str, start_pos: int) -> str:
    before_words = text[:start_pos].split()[-_WORD_WINDOW:]
    after_words = text[start_pos + len(selection):].split()[:_WORD_WINDOW]
    return f"{' '.join(before_words)} [{selection}] {' '.join(after_words)}".strip()


def _parse_verdict(raw: Any) -> Dict[str, Any]:
    """Robustly parse the LLM JSON verdict with multiple fallback strategies."""
    # Normalise list-of-blocks from newer LangChain versions
    if isinstance(raw, list):
        raw = raw[0].get("text", "") if isinstance(raw[0], dict) else str(raw)

    raw_str = str(raw).strip()

    # Strip markdown fences and backticks
    cleaned = re.sub(r"```(?:json)?", "", raw_str).strip().strip("`").strip()

    # Strategy 1: direct JSON parse
    try:
        data = json.loads(cleaned)
        return {
            "is_pii": bool(data.get("is_pii", False)),
            "pii_type": str(data.get("type", "not_pii")),
            "confidence": float(data.get("confidence", 0.0)),
            "reason": str(data.get("reason", "")).strip(),
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        pass

    # Strategy 2: extract the first {...} block with regex (handles truncated fences)
    match = re.search(r'\{[^{}]*"is_pii"[^{}]*\}', cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group())
            return {
                "is_pii": bool(data.get("is_pii", False)),
                "pii_type": str(data.get("type", "not_pii")),
                "confidence": float(data.get("confidence", 0.0)),
                "reason": str(data.get("reason", "")).strip(),
            }
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

    # Strategy 3: heuristic — look for is_pii boolean in raw text
    is_pii = bool(re.search(r'"is_pii"\s*:\s*true', cleaned, re.IGNORECASE))
    confidence_m = re.search(r'"confidence"\s*:\s*([0-9.]+)', cleaned)
    confidence = float(confidence_m.group(1)) if confidence_m else (0.85 if is_pii else 0.0)
    type_m = re.search(r'"type"\s*:\s*"([^"]+)"', cleaned)
    pii_type = type_m.group(1) if type_m else ("person_name" if is_pii else "not_pii")

    logger.warning("Context check: used heuristic parse for: %s", raw_str[:100])
    return {
        "is_pii": is_pii,
        "pii_type": pii_type,
        "confidence": confidence,
        "reason": "Parsed from partial response",
    }


def _build_llm() -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set in backend/.env")
    return ChatGoogleGenerativeAI(
        model=_MODEL,
        google_api_key=api_key,
        temperature=0,
        max_output_tokens=_MAX_OUTPUT_TOKENS,
    )


def run_context_check(text: str, selection: str) -> Dict[str, Any]:
    """
    Single-word Micro-RAG context check.
    KMP finds all occurrences → 30-word window → one LLM call → verdict.
    """
    clean_sel = clean_entity(selection) or selection.strip()

    positions = kmp_search(text, clean_sel)
    if not positions:
        return {
            "is_pii": False, "pii_type": "not_pii", "confidence": 0.0,
            "reason": "Not found in document", "context_window": "",
            "occurrences": [],
        }

    context_window = _build_context_window(text, clean_sel, positions[0])

    try:
        llm = _build_llm()
        response = llm.invoke([
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=f'Sentence: "{context_window}"\nHighlighted: "{clean_sel}"'),
        ])
        raw_output = response.content if hasattr(response, "content") else str(response)
    except EnvironmentError:
        raise
    except Exception as e:
        logger.error("LLM call failed for '%s': %s", clean_sel, e)
        # Return a safe fallback instead of crashing
        return {
            "is_pii": False, "pii_type": "not_pii", "confidence": 0.0,
            "reason": f"LLM unavailable: {str(e)[:60]}",
            "context_window": context_window,
            "occurrences": [
                {"startIndex": p, "endIndex": p + len(clean_sel), "text": text[p: p + len(clean_sel)]}
                for p in positions
            ],
        }

    verdict = _parse_verdict(raw_output)

    return {
        **verdict,
        "context_window": context_window,
        "occurrences": [
            {"startIndex": p, "endIndex": p + len(clean_sel), "text": text[p: p + len(clean_sel)]}
            for p in positions
        ],
    }


def run_batch_context_check(text: str, selections: List[str]) -> List[Dict[str, Any]]:
    """
    Batch Micro-RAG: check multiple words, each with its own LLM call.
    Returns results in the same order as the input selections list.
    """
    llm = _build_llm()
    results = []

    for selection in selections:
        clean_sel = clean_entity(selection) or selection.strip()
        positions = kmp_search(text, clean_sel)

        if not positions:
            results.append({
                "selection": selection,
                "is_pii": False, "pii_type": "not_pii", "confidence": 0.0,
                "reason": "Not found in document", "context_window": "",
                "occurrences": [],
            })
            continue

        context_window = _build_context_window(text, clean_sel, positions[0])

        try:
            response = llm.invoke([
                SystemMessage(content=_SYSTEM_PROMPT),
                HumanMessage(content=f'Sentence: "{context_window}"\nHighlighted: "{clean_sel}"'),
            ])
            raw_output = response.content if hasattr(response, "content") else str(response)
            verdict = _parse_verdict(raw_output)
        except Exception as e:
            logger.error("Batch LLM call failed for '%s': %s", clean_sel, e)
            verdict = {
                "is_pii": False, "pii_type": "not_pii", "confidence": 0.0,
                "reason": f"LLM error: {str(e)[:40]}",
            }

        results.append({
            "selection": selection,
            **verdict,
            "context_window": context_window,
            "occurrences": [
                {"startIndex": p, "endIndex": p + len(clean_sel), "text": text[p: p + len(clean_sel)]}
                for p in positions
            ],
        })

    return results
