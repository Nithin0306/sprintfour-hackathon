from fastapi import APIRouter
from models.schemas import DetectRequest, DetectResponse, Span
from services.regex_service import run_regex_pass

router = APIRouter()


@router.post("/detect", response_model=DetectResponse)
def detect(request: DetectRequest):
    raw_matches = run_regex_pass(request.text)

    spans = [
        Span(
            id=f"r{i}",
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

    return DetectResponse(spans=spans)
