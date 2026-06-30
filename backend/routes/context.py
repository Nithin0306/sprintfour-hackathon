from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from models.schemas import ContextCheckRequest, ContextCheckResponse, OccurrenceSpan
from services.context_service import run_context_check, run_batch_context_check

router = APIRouter()


# ── Single word check ──────────────────────────────────────────────────────
@router.post("/context-check", response_model=ContextCheckResponse)
def context_check(request: ContextCheckRequest):
    if not request.selection or len(request.selection.strip()) < 2:
        raise HTTPException(status_code=400, detail="Selection must be at least 2 characters")
    try:
        result = run_context_check(request.text, request.selection)
        return ContextCheckResponse(
            is_pii=result["is_pii"],
            pii_type=result["pii_type"],
            confidence=result["confidence"],
            reason=result["reason"],
            context_window=result["context_window"],
            occurrences=[OccurrenceSpan(**o) for o in result["occurrences"]],
        )
    except EnvironmentError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Context check failed: {e}")


# ── Batch word check ───────────────────────────────────────────────────────
class BatchContextCheckRequest(BaseModel):
    text: str
    selections: List[str]


class BatchResultItem(BaseModel):
    selection: str
    is_pii: bool
    pii_type: str
    confidence: float
    reason: str
    context_window: str
    occurrences: List[OccurrenceSpan]


class BatchContextCheckResponse(BaseModel):
    results: List[BatchResultItem]


@router.post("/context-check/batch", response_model=BatchContextCheckResponse)
def context_check_batch(request: BatchContextCheckRequest):
    """
    Check multiple user-selected words in one call.
    Each word gets its own focused LLM call via Micro-RAG.
    """
    if not request.selections:
        raise HTTPException(status_code=400, detail="Selections list is empty")

    # Deduplicate while preserving order
    seen = set()
    unique = [s for s in request.selections if s not in seen and not seen.add(s)]

    try:
        raw_results = run_batch_context_check(request.text, unique)
        return BatchContextCheckResponse(
            results=[
                BatchResultItem(
                    selection=r["selection"],
                    is_pii=r["is_pii"],
                    pii_type=r["pii_type"],
                    confidence=r["confidence"],
                    reason=r["reason"],
                    context_window=r["context_window"],
                    occurrences=[OccurrenceSpan(**o) for o in r["occurrences"]],
                )
                for r in raw_results
            ]
        )
    except EnvironmentError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch context check failed: {e}")
