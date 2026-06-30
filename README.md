# Conseal Redaction Pipeline

An interactive, hybrid-intelligence document redaction platform designed to seamlessly protect Personally Identifiable Information (PII) without sacrificing document readability or performance.

## The Challenge

In industries handling massive volumes of sensitive documents—such as healthcare, legal, and finance—protecting PII is critical but fraught with operational hurdles. Traditional automated redaction tools relying solely on regular expressions excel at catching structured data (like phone numbers and emails) but fail spectacularly at understanding context, leading to missed names or aggressive over-redaction of safe terms. Conversely, passing entire documents through Large Language Models (LLMs) to understand this context is prohibitively slow, expensive, and prone to hallucinations. The goal was to engineer a system that balances absolute precision, operational speed, and the indispensable need for human oversight.

## The Architecture

To solve this, Conseal employs a multi-layered, "human-in-the-loop" architecture that isolates the strengths of different technologies:

1. **Deterministic Layer (Zero-Cost Baseline):** A blazing-fast regex scanner immediately strips out structured PII (SSNs, IBANs, phone numbers, IPs, dates) across the document. This handles the bulk of the heavy lifting instantly.
2. **Micro-RAG AI Verification (High Precision):** Instead of feeding the whole document to an LLM, the system allows users to highlight ambiguous terms. The backend extracts only a tightly focused 30-word context window around that term and sends it to Gemini 3.5 Flash. This drastically reduces token usage, latency, and cost while providing pinpoint accurate classifications based on the surrounding sentence structure.
3. **KMP Propagation (O(n+m) Speed):** When a user decides to redact or mark a word as safe, the backend utilizes the Knuth-Morris-Pratt (KMP) string matching algorithm to instantly find and synchronize that decision across all occurrences of the word in the entire document.

## Interactive Workflow

The frontend, built with Next.js and TailwindCSS, is designed for rapid review and decisive action:

- **X-Ray Mode:** A toggleable view that highlights detected PII in distinct colors based on their source and confidence, rather than obscuring them immediately. This allows the reviewer to actually see what is being removed.
- **Context Queueing:** Users can select plain text to add to an AI verification queue, or click highlighted spans to instantly "Mark Safe" (striking them out in green) or "Redact All" (confirming the redaction).
- **The Confidence Dashboard:** Because the most dangerous mistakes are the ones users ignore, the application proves its value at the very end of the workflow. Upon finalization, a dashboard details the exact metrics of the session: the baseline AI catch rate, critical structured misses caught by the system, false positives corrected by the user, and a final composite system confidence score.
- **Styled Export:** The finalized document is exported as a clean HTML file, replacing redacted text with solid black blocks (████) and safely striking through approved false positives, preserving the exact intent of the review session.

## Tech Stack

- **Frontend:** Next.js (React), TailwindCSS
- **Backend:** FastAPI (Python), LangChain
- **AI Model:** Google Gemini 3.5 Flash
- **Algorithms:** Knuth-Morris-Pratt (KMP) string matching

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.9+)
- A Google Gemini API Key

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the `backend` directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.
