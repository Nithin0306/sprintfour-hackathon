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

export const mockRawText = `JOHN DOE — SENIOR SOFTWARE ENGINEER
Email: john.doe.87@gmail.com | Phone: (555) 123-4567 | SSN: 123-45-6789
Location: San Francisco, CA | DOB: 05/12/1987

SUMMARY
Senior Software Engineer with 8+ years of experience. Previously at Amazon Health Partners and Microsoft. Specialized in distributed systems and NLP.

EXPERIENCE
Amazon Health Partners — Software Engineer (2018 - 2021)
- Developed critical infrastructure for patient data processing.
- Worked closely with Dr. Arjun Iyer to integrate medical data APIs.
- Maintained legacy databases for Dr. Arjun Iyer's clinic.

Microsoft — Junior Engineer (2015 - 2018)
- Built internal tools using Node.js and React.
- Managed server deployments with IP 192.168.1.105.
- Handled billing integrations using test card 4111 1111 1111 1111.

EDUCATION
University of California, Berkeley
B.S. in Computer Science (2011 - 2015)

REFERENCES
Karna Mehta — Engineering Manager at Amazon Health Partners
Contact: karna@sprintfour.com | +1 987-654-3210
Dr. Arjun Iyer — Medical Consultant
Contact: arjun.iyer@cityhealth.in

PERSONAL DETAILS
Backup SSN record: 123 45 6789
IBAN: GB29 NWBK 6016 1331 9268 19
Secondary card: 5500-0000-0000-0004`;

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
  systemCritical: boolean,
  occurrenceIndex: number = 0
): Span {
  let startIndex = -1;
  let currentPos = 0;
  for (let i = 0; i <= occurrenceIndex; i++) {
    startIndex = mockRawText.indexOf(textToFind, currentPos);
    if (startIndex === -1) throw new Error(`Span text not found: "${textToFind}" at occurrence ${i}`);
    currentPos = startIndex + 1;
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
    status: "suggested",
  };
}

export const mockSpans: Span[] = [
  findSpan("s1", "JOHN DOE", "name", "llm", 0.95, false),
  findSpan("s2", "john.doe.87@gmail.com", "email", "regex", 0.99, true),
  findSpan("s3", "(555) 123-4567", "phone", "regex", 0.99, true),
  findSpan("s4", "123-45-6789", "ssn", "regex", 0.99, true),
  findSpan("s5", "Amazon", "organization", "llm", 0.45, true, 0), // Tripwire! False positive
  findSpan("s6", "Amazon", "organization", "llm", 0.45, true, 1),
  findSpan("s7", "Amazon", "organization", "llm", 0.45, true, 2),
  findSpan("s8", "Dr. Arjun Iyer", "name", "llm", 0.92, false, 0),
  findSpan("s9", "Dr. Arjun Iyer", "name", "llm", 0.92, false, 1),
  findSpan("s10", "Karna Mehta", "name", "llm", 0.88, false, 0),
  // Intentionally missed by the mock tool (will be caught by real regex scan):
  // - +1 987-654-3210
  // - 123 45 6789
  // - 5500-0000-0000-0004
  // - GB29 NWBK 6016 1331 9268 19
  // - 192.168.1.105
  // - 05/12/1987
  // - 4111 1111 1111 1111
  // - arjun.iyer@cityhealth.in
  // - karna@sprintfour.com
];
