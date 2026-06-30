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
