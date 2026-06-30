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

export type DetectRequest = {
  text: string;
};

export type DetectResponse = {
  spans: Span[];
};
