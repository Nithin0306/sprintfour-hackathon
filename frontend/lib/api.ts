import {
  DetectRequest, DetectResponse,
  BatchContextCheckRequest, BatchContextCheckResponse,
} from './types';

const API = 'http://localhost:8000';

export async function detectRegex(req: DetectRequest): Promise<DetectResponse> {
  const res = await fetch(`${API}/detect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Regex scan failed: ${res.status}`);
  return res.json();
}

export async function detectFull(req: DetectRequest): Promise<DetectResponse> {
  const res = await fetch(`${API}/detect/full`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
  });
  if (res.status === 503) throw new Error('API key not configured');
  if (!res.ok) throw new Error(`Full scan failed: ${res.status}`);
  return res.json();
}

/** Batch Micro-RAG: check a queue of words with context windows */
export async function batchContextCheck(req: BatchContextCheckRequest): Promise<BatchContextCheckResponse> {
  const res = await fetch(`${API}/context-check/batch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
  });
  if (res.status === 503) throw new Error('API key not configured');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `Batch check failed: ${res.status}`);
  }
  return res.json();
}
