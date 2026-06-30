import { DetectRequest, DetectResponse } from './types';

const API_BASE_URL = 'http://localhost:8000';

export async function pingBackend(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/ping`);
  if (!res.ok) throw new Error('Failed to ping backend');
  return res.json();
}

export async function detectSpans(request: DetectRequest): Promise<DetectResponse> {
  const res = await fetch(`${API_BASE_URL}/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Detection failed: ${res.status}`);
  return res.json();
}
