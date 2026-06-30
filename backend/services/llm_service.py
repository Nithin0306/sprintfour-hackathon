import os
import re
import json
import logging
from typing import List, Dict, Any

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from services.kmp_service import clean_entity, kmp_find_all_spans

load_dotenv()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token budget & chunking config
# ---------------------------------------------------------------------------
# Gemini Flash is the cheapest token-efficient model. We target <1000 input
# tokens per chunk so we stay well within free-tier rate limits.
_MODEL_NAME = "gemini-3.5-flash"
_CHUNK_SIZE = 800           # characters per chunk
_CHUNK_OVERLAP = 100        # characters to overlap so entities on boundaries aren't missed
_CONFIDENCE_THRESHOLD = 0.6 # spans below this are dropped


# ---------------------------------------------------------------------------
# PII scoring guidelines injected into the system prompt (compact, reusable).
# These tell the LLM exactly what to look for and how to score them.
# Kept short deliberately — every token in the system prompt is paid on every call.
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """You are a PII detection assistant. Extract personally identifying information from the given text.

RULES:
- Only extract: person_name, organization, location, job_title, vehicle_id, medical_condition, legal_case
- Score each entity 0.0–1.0 based on PII risk:
  * 1.0 = unambiguous PII (full name in contact context, named patient, named doctor)
  * 0.8 = likely PII (first name only in personal context, clinic/hospital name)
  * 0.6 = contextual PII (company name that reveals identity, city when combined with other PII)
  * <0.6 = generic proper noun, NOT PII (e.g. "Amazon", "Google", a common city mentioned in passing)
- Return ONLY a JSON array. No commentary, no markdown fences.
- Each item: {"text": "<exact substring>", "type": "<type>", "score": <float>}
- text must be an EXACT substring of the input. Do not paraphrase or normalize."""


# ---------------------------------------------------------------------------
# Pydantic model for a single LLM-returned entity (before offset recovery)
# ---------------------------------------------------------------------------
class _RawEntity(BaseModel):
    text: str = Field(description="Exact substring from the document")
    type: str = Field(description="PII entity type")
    score: float = Field(description="Confidence score 0.0–1.0")


def _build_llm() -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set in environment.")
    return ChatGoogleGenerativeAI(
        model=_MODEL_NAME,
        google_api_key=api_key,
        temperature=0,          # deterministic — we want consistent extractions
        max_output_tokens=512,  # entity list is small; cap output tokens tightly
    )


def _chunk_text(text: str) -> List[Dict[str, Any]]:
    """
    Split `text` into overlapping windows.
    Each chunk carries its absolute start offset so that recovered indices
    are relative to the original document, not the chunk.
    """
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + _CHUNK_SIZE, len(text))
        chunks.append({"text": text[start:end], "offset": start})
        if end == len(text):
            break
        # Step forward by (chunk_size - overlap) so the next window
        # revisits the tail of the current one.
        start += _CHUNK_SIZE - _CHUNK_OVERLAP
    return chunks


def _recover_offsets(
    entity_text: str,
    doc_text: str,
    chunk_offset: int,
    search_from: int,
) -> int:
    """
    Find entity_text within doc_text starting near `search_from`.
    We search within a window anchored at chunk_offset to avoid expensive
    full-string searches on long documents.
    Returning -1 signals that the entity text was hallucinated / doesn't match.
    """
    # Search window: the chunk itself plus a small tail (for boundary entities).
    window_start = chunk_offset
    window_end = min(chunk_offset + _CHUNK_SIZE + _CHUNK_OVERLAP, len(doc_text))
    window = doc_text[window_start:window_end]

    idx = window.find(entity_text, max(0, search_from - window_start))
    if idx == -1:
        # Fallback: try the whole window without start constraint
        idx = window.find(entity_text)
    if idx == -1:
        return -1
    return window_start + idx


def _parse_llm_response(raw: Any) -> List[_RawEntity]:
    """
    Safely parse the LLM's JSON output.

    Primary path: standard JSON array.
    Fallback path: LLM returned a messy non-JSON string (e.g. just the name
    itself, or wrapped in filler text). In this case we use the KMP cleaner
    to extract the actual entity text and synthesize a single high-confidence
    _RawEntity from it, defaulting to type 'person_name' (the most common
    semantic entity the LLM detects).
    """
    # Normalise list-of-blocks responses from newer LangChain versions
    if isinstance(raw, list):
        raw = raw[0].get("text", "") if isinstance(raw[0], dict) else str(raw)

    raw_str = str(raw).strip()
    cleaned = re.sub(r"```(?:json)?", "", raw_str).strip().strip("`").strip()

    # --- Primary path: try JSON ---
    try:
        data = json.loads(cleaned)
        if not isinstance(data, list):
            return []
        entities = []
        for item in data:
            if not isinstance(item, dict):
                continue
            try:
                entities.append(_RawEntity(**item))
            except Exception:
                continue
        return entities
    except json.JSONDecodeError:
        pass

    # --- Fallback path: messy non-JSON string ---
    # The LLM sometimes just returns the entity text directly, e.g.:
    #   'Arjun Iyer'  or  'LLM returned non-JSON output: "Arjun Iyer"'
    # Use the KMP cleaner to strip filler, titles, and quotes.
    entity_text = clean_entity(raw_str)
    if entity_text and len(entity_text) > 2:
        logger.info("Non-JSON fallback: extracted entity %r from LLM output", entity_text)
        return [_RawEntity(text=entity_text, type="person_name", score=0.75)]

    logger.warning("LLM returned uninterpretable output: %s", raw_str[:200])
    return []


def run_llm_pass(text: str) -> List[Dict[str, Any]]:
    """
    Layer 2 semantic PII detection via Gemini.

    Strategy:
    1. Split the document into overlapping ~800-char chunks (token-efficient).
    2. For each chunk, send a compact system prompt + chunk text to Gemini Flash.
    3. Parse the structured JSON response.
    4. Discard entities below the confidence threshold.
    5. Recover exact character offsets via substring search.
    6. Deduplicate across chunks (same entity may appear in an overlap region).

    Returns a list of span dicts (same shape as regex_service output).
    """
    llm = _build_llm()
    chunks = _chunk_text(text)
    seen: set[str] = set()          # (text, startIndex) dedup key
    results: List[Dict[str, Any]] = []

    for chunk in chunks:
        chunk_text = chunk["text"]
        chunk_offset = chunk["offset"]

        try:
            response = llm.invoke([
                SystemMessage(content=_SYSTEM_PROMPT),
                HumanMessage(content=chunk_text),
            ])
            raw_output = response.content if hasattr(response, "content") else str(response)
        except Exception as e:
            logger.error("LLM call failed for chunk at offset %d: %s", chunk_offset, e)
            continue

        entities = _parse_llm_response(raw_output)

        for entity in entities:
            # Score gate — drop low-confidence extractions
            if entity.score < _CONFIDENCE_THRESHOLD:
                continue

            # Clean the entity text (strip titles like "Dr.", filler, quotes)
            entity_text = clean_entity(entity.text)
            if not entity_text:
                continue

            # Use KMP to find ALL occurrences of this entity in the full document
            # (not just the current chunk). This is both more accurate than a
            # substring window search and handles repeated mentions automatically.
            spans_for_entity = kmp_find_all_spans(
                text=text,
                entity_text=entity_text,
                entity_type=entity.type,
                confidence=round(entity.score, 2),
                system_critical=entity.score >= 0.8,
            )

            for span in spans_for_entity:
                dedup_key = f"{span['text']}:{span['startIndex']}"
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)
                span["source"] = "llm"  # mark origin as llm even though KMP found the offset
                results.append(span)

    # Sort by position for clean downstream merging
    results.sort(key=lambda x: x["startIndex"])
    return results
