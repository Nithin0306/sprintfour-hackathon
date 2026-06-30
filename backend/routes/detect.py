from fastapi import APIRouter, HTTPException
from models.schemas import DetectRequest, DetectResponse, Span
from services.regex_service import run_regex_pass
from services.llm_service import run_llm_pass
from services.merge_service import merge_and_dedupe, run_string_match_pass

router = APIRouter()


def _to_spans(raw_matches, prefix: str) -> list[Span]:
    return [
        Span(
            id=f"{prefix}{i}",
            startIndex=m["startIndex"],
            endIndex=m["endIndex"],
            text=m["text"],
            type=m["type"],
            source=m["source"],
            confidence=m["confidence"],
            systemCritical=m["systemCritical"],
            status=m["status"],
        )
        for i, m in enumerate(raw_matches)
    ]


@router.post("/detect", response_model=DetectResponse)
def detect_regex(request: DetectRequest):
    """Layer 1 only — deterministic regex pass. Fast, no API cost."""
    raw = run_regex_pass(request.text)
    return DetectResponse(spans=_to_spans(raw, "r"))


@router.post("/detect/full", response_model=DetectResponse)
def detect_full(request: DetectRequest):
    """
    Layers 1 + 2 + 3 — regex pass merged with LLM semantic pass and String Match pass.
    Requires GEMINI_API_KEY in backend/.env
    """
    try:
        regex_raw = run_regex_pass(request.text)
        llm_raw = run_llm_pass(request.text)
        
        # Layer 3: Take all found strings and search the document for exact occurrences
        string_match_raw = run_string_match_pass(request.text, regex_raw + llm_raw)
        
        merged = merge_and_dedupe(regex_raw, llm_raw, string_match_raw)
        return DetectResponse(spans=_to_spans(merged, "m"))
    except EnvironmentError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")
