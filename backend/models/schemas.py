from pydantic import BaseModel
from typing import List, Optional


class Span(BaseModel):
    id: str
    startIndex: int
    endIndex: int
    text: str
    type: str
    source: str
    confidence: float
    systemCritical: bool
    status: str


class DetectRequest(BaseModel):
    text: str


class DetectResponse(BaseModel):
    spans: List[Span]


class ContextCheckRequest(BaseModel):
    text: str          # Full document text
    selection: str     # The word/phrase the user highlighted


class OccurrenceSpan(BaseModel):
    startIndex: int
    endIndex: int
    text: str          # Original-casing match from the document


class ContextCheckResponse(BaseModel):
    is_pii: bool
    pii_type: str      # e.g. "person_name", "organization", "not_pii"
    confidence: float
    reason: str        # ≤10 words from the LLM
    context_window: str  # The 30-word snippet sent to the LLM
    occurrences: List[OccurrenceSpan]
