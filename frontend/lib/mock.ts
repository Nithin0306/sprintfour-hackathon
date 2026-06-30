import { Span } from "./types";

export const mockRawText = `Hi, this is Karna from Sprintfour. You can reach me at 9876543210 or 
karna@sprintfour.com. We discussed the Amazon delivery issue with my 
colleague Priya Sharma at our office in Bangalore. My SSN is not 
relevant here but my card number 4111 1111 1111 1111 was charged twice.`;

// Helper to easily define spans without manually counting indices
function createMockSpan(id: string, textToFind: string, type: string, source: string, confidence: number, systemCritical: boolean): Span {
  const startIndex = mockRawText.indexOf(textToFind);
  if (startIndex === -1) {
    throw new Error(`Mock text not found: "${textToFind}"`);
  }
  return {
    id,
    startIndex,
    endIndex: startIndex + textToFind.length,
    text: textToFind,
    type,
    source,
    confidence,
    systemCritical,
    status: "suggested"
  };
}

export const mockSpans: Span[] = [
  createMockSpan("s1", "Karna", "name", "llm", 0.91, false),
  createMockSpan("s2", "Sprintfour", "organization", "llm", 0.88, false),
  createMockSpan("s3", "9876543210", "phone", "regex", 0.99, true),
  createMockSpan("s4", "karna@sprintfour.com", "email", "regex", 0.99, true),
  createMockSpan("s5", "Amazon", "organization", "llm", 0.45, true), // Tripwire!
  createMockSpan("s6", "Priya Sharma", "name", "llm", 0.95, false),
  createMockSpan("s7", "Bangalore", "location", "llm", 0.90, false),
  createMockSpan("s8", "4111 1111 1111 1111", "credit_card", "regex", 0.99, true)
];
