export type Span = {
  id: string;
  startIndex: number;
  endIndex: number;
  text: string;
  type: string;
  source: string;
  confidence: number;
  systemCritical: boolean;
  status: string;
};

export type DetectRequest = { text: string };
export type DetectResponse = { spans: Span[] };

export type OccurrenceSpan = { startIndex: number; endIndex: number; text: string };

export type ContextCheckRequest = { text: string; selection: string };
export type ContextCheckResponse = {
  is_pii: boolean;
  pii_type: string;
  confidence: number;
  reason: string;
  context_window: string;
  occurrences: OccurrenceSpan[];
};

export type BatchContextCheckRequest = { text: string; selections: string[] };
export type BatchResultItem = {
  selection: string;
  is_pii: boolean;
  pii_type: string;
  confidence: number;
  reason: string;
  context_window: string;
  occurrences: OccurrenceSpan[];
};
export type BatchContextCheckResponse = { results: BatchResultItem[] };
