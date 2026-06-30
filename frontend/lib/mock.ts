import { Span } from "./types";

// ---------------------------------------------------------------------------
// This is the enriched mock document used as the base text for the viewer.
// It deliberately includes tricky edge-cases to stress-test the regex layer:
//   - Phone numbers in multiple formats (international, local, formatted)
//   - A partial 4-digit number that must NOT be flagged as a phone
//   - A credit card in space-separated format
//   - An SSN in two formats
//   - An IBAN
//   - An email inside a sentence
//   - An IP address
//   - A date of birth
// ---------------------------------------------------------------------------

export const mockRawText = `Patient Intake Form — Confidential

Patient: Priya Sharma
Date of Birth: 14/09/1987
Contact: +91-98765-43210 (home) or (080) 234-5678 (work)
Email: priya.sharma@cityhealth.in
Room number: 4021

Emergency Contact: Karna Mehta — karna@sprintfour.com
Alternate Phone: 9876543210

Insurance ID / SSN: 532-74-8921
Backup format SSN: 532 74 8921

Card on file: 4111 1111 1111 1111
Secondary card: 5500-0000-0000-0004

IBAN (international transfer): GB29 NWBK 6016 1331 9268 19
IP address of last login: 192.168.1.105

Attending Physician: Dr. Arjun Iyer
Clinic: Sprintfour Health, Bangalore
Notes: Patient was referred by Amazon Health Partners. Treatment plan discussed.`;

// ---------------------------------------------------------------------------
// Hardcoded mock spans used as the initial state (before the regex scan runs).
// These are what the "tool" originally suggested — some are correct, some are
// false positives (Amazon), some are missed (the secondary card, the IBAN, etc.)
// ---------------------------------------------------------------------------

function findSpan(
  id: string,
  textToFind: string,
  type: string,
  source: string,
  confidence: number,
  systemCritical: boolean
): Span {
  const startIndex = mockRawText.indexOf(textToFind);
  if (startIndex === -1) throw new Error(`Span text not found: "${textToFind}"`);
  return {
    id,
    startIndex,
    endIndex: startIndex + textToFind.length,
    text: textToFind,
    type,
    source,
    confidence,
    systemCritical,
    status: "suggested",
  };
}

export const mockSpans: Span[] = [
  findSpan("s1", "Priya Sharma", "name", "llm", 0.95, false),
  findSpan("s2", "+91-98765-43210", "phone", "regex", 0.99, true),
  findSpan("s3", "priya.sharma@cityhealth.in", "email", "regex", 0.99, true),
  findSpan("s4", "Karna Mehta", "name", "llm", 0.92, false),
  findSpan("s5", "karna@sprintfour.com", "email", "regex", 0.99, true),
  findSpan("s6", "532-74-8921", "ssn", "regex", 0.99, true),
  findSpan("s7", "4111 1111 1111 1111", "credit_card", "regex", 0.99, true),
  findSpan("s8", "Amazon", "organization", "llm", 0.45, true), // Tripwire! LLM flagged this but it's a false positive
  // Intentionally missed by the mock tool (will be caught by real regex scan):
  // - (080) 234-5678
  // - 9876543210
  // - 532 74 8921
  // - 5500-0000-0000-0004
  // - GB29 NWBK 6016 1331 9268 19
  // - 192.168.1.105
  // - 14/09/1987
];
