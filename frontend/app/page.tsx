"use client";

import { useState, useCallback } from "react";
import DocumentViewer from "@/components/DocumentViewer";
import XRayToggle from "@/components/XRayToggle";
import ContextPanel from "@/components/ContextPanel";
import { mockRawText, mockSpans } from "@/lib/mock";
import { detectRegex } from "@/lib/api";
import { Span } from "@/lib/types";

type ScanState = "idle" | "scanning" | "done" | "error";

/** Merge newSpans into existing spans:
 *  - regex source always wins on overlapping ranges
 *  - existing spans that don't overlap are preserved
 */
function mergeSpans(existing: Span[], incoming: Span[]): Span[] {
  // Drop any existing span that overlaps with an incoming one
  const kept = existing.filter(
    (e) =>
      !incoming.some(
        (n) => n.startIndex < e.endIndex && n.endIndex > e.startIndex
      )
  );
  return [...kept, ...incoming].sort((a, b) => a.startIndex - b.startIndex);
}

export default function Home() {
  const [isXRayMode, setIsXRayMode] = useState(true);
  const [isFinalized, setIsFinalized] = useState(false);

  // History Stack for Undo/Redo
  const [history, setHistory] = useState<Span[][]>([mockSpans]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const spans = history[historyIndex];

  function pushHistory(newSpans: Span[]) {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSpans);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }

  function handleUndo() {
    if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
  }

  function handleRedo() {
    if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1);
  }

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanStats, setScanStats] = useState<{ found: number; newCount: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Word queues for the context panel
  const [wordQueue, setWordQueue] = useState<string[]>([]);
  const [unredactQueue, setUnredactQueue] = useState<string[]>([]);


  async function runRegexScan() {
    setScanState("scanning");
    setScanStats(null);
    setScanError(null);
    try {
      const res = await detectRegex({ text: mockRawText });
      // FIX: merge into current spans instead of replacing
      const current = history[historyIndex];
      const merged = mergeSpans(current, res.spans);
      const newCount = merged.length - current.length;
      pushHistory(merged);
      setScanStats({ found: merged.length, newCount });
      setScanState("done");
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : "Unknown error");
      setScanState("error");
    }
  }

  function handleReset() {
    setHistory([mockSpans]);
    setHistoryIndex(0);
    setScanState("idle");
    setScanStats(null);
    setScanError(null);
    setWordQueue([]);
    setUnredactQueue([]);
    setIsFinalized(false);
  }

  const MAX_QUEUE_SIZE = 5;

  const handleTextSelect = useCallback(
    (text: string, startOffset: number) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed.length < 2) return;

      // Route to unredact queue ONLY if the selection overlaps an active (non-safe) span.
      // When startOffset === -1 it came from the popover "Queue for AI" button on a span,
      // which means the user explicitly wants AI check, NOT unredact.
      const selectionEnd = startOffset + trimmed.length;
      const isOverlappingRedactedSpan =
        startOffset >= 0 &&
        spans.some(
          (s) =>
            s.status !== "safe" &&
            s.startIndex < selectionEnd &&
            s.endIndex > startOffset
        );

      if (isOverlappingRedactedSpan) {
        setUnredactQueue((prev) => {
          if (prev.includes(trimmed)) return prev;
          return [...prev, trimmed];
        });
        return;
      }

      setWordQueue((prev) => {
        if (prev.includes(trimmed)) return prev;
        if (prev.length >= MAX_QUEUE_SIZE) {
          alert("You can only queue up to 5 words at a time. Please run the AI Check on these first.");
          return prev;
        }
        return [...prev, trimmed];
      });
    },
    [spans]
  );

  function handleRemoveFromQueue(word: string) {
    setWordQueue((prev) => prev.filter((w) => w !== word));
  }

  function handleRemoveFromUnredactQueue(word: string) {
    setUnredactQueue((prev) => prev.filter((w) => w !== word));
  }

  function handleUpdateSpans(spansToAdd: Span[], spanIdsToRemove: string[]) {
    const current = history[historyIndex];
    let next = current.filter((s) => !spanIdsToRemove.includes(s.id));

    // Remove overlaps for the new spans
    next = next.filter(
      (existing) =>
        !spansToAdd.some(
          (ns) => ns.startIndex < existing.endIndex && ns.endIndex > existing.startIndex
        )
    );

    next = [...next, ...spansToAdd].sort((a, b) => a.startIndex - b.startIndex);
    pushHistory(next);
  }

  // Phase 3: Mark all occurrences of a word as safe (false positive)
  function handleMarkSafe(text: string) {
    const lower = text.toLowerCase();
    const next = spans.map((s) =>
      s.text.toLowerCase() === lower ? { ...s, status: "safe" } : s
    );
    pushHistory(next);
    // Remove from unredact queue if it was there
    setUnredactQueue((prev) => prev.filter((w) => w.toLowerCase() !== lower));
  }

  // Phase 3: Mark all occurrences of a word as redacted (approved)
  function handleMarkRedacted(text: string) {
    const lower = text.toLowerCase();
    const next = spans.map((s) =>
      s.text.toLowerCase() === lower ? { ...s, status: "redacted" } : s
    );
    pushHistory(next);
  }

  // Phase 4: Generate redacted HTML string
  function generateRedactedHTML(): string {
    const sortedSpans = [...spans].sort((a, b) => a.startIndex - b.startIndex);
    let result = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Redacted Document</title>
<style>
  body { font-family: serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #18181b; white-space: pre-wrap; }
  .redacted { background-color: #18181b; color: transparent; user-select: none; border-radius: 3px; }
  .safe { text-decoration: line-through; background-color: #d1fae5; color: #71717a; border-radius: 3px; }
</style>
</head>
<body>`;

    let cursor = 0;
    for (const s of sortedSpans) {
      if (s.startIndex < cursor) continue; // Skip overlaps
      
      const beforeText = mockRawText.slice(cursor, s.startIndex)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      result += beforeText;

      const spanText = mockRawText.slice(s.startIndex, s.endIndex)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      if (s.status === "safe") {
        result += `<span class="safe">${spanText}</span>`;
      } else {
        result += `<span class="redacted">${spanText}</span>`;
      }

      cursor = s.endIndex;
    }
    
    const afterText = mockRawText.slice(cursor)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    result += afterText;
    result += `</body>\n</html>`;
    
    return result;
  }

  // Phase 4: Finalize — lock state and trigger download
  function handleFinalize() {
    const htmlContent = generateRedactedHTML();
    const next = spans.map((s) =>
      s.status === "suggested" || s.status === "redacted" || s.status === "approved"
        ? { ...s, status: "finalized" }
        : s
    );
    pushHistory(next);
    setIsFinalized(true);

    // Trigger browser download of the redacted document
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume_john_doe_REDACTED.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const isScanning = scanState === "scanning";

  return (
    <main className="min-h-screen bg-zinc-950 text-white font-sans">
      <div className="max-w-screen-xl mx-auto px-6 py-8 md:py-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800 pb-5 mb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Review Redactions</h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Highlight any word to queue it for AI verification, or run the regex scanner to auto-detect PII.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-4">
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <button
                onClick={handleUndo}
                disabled={historyIndex === 0}
                className="w-8 h-8 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Undo"
              >
                ↶
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex === history.length - 1}
                className="w-8 h-8 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Redo"
              >
                ↷
              </button>
            </div>
            <XRayToggle isOn={isXRayMode} onToggle={() => setIsXRayMode(!isXRayMode)} />
          </div>
        </div>

        {/* Detection Controls — Layer 1 Regex only */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden mb-5">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="w-20 shrink-0">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Layer 1</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200">Regex Scanner</p>
              <p className="text-xs text-zinc-500">Phone, email, SSN, card, IBAN, IP, date — instant, no API cost</p>
            </div>

            {scanState === "done" && scanStats && (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs">
                  {scanStats.found} total
                </span>
                {scanStats.newCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-950 text-amber-400 border border-amber-800 text-xs">
                    +{scanStats.newCount} new
                  </span>
                )}
                <button
                  onClick={handleReset}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Reset
                </button>
              </div>
            )}
            {scanState === "error" && (
              <span className="text-xs text-red-400">⚠ {scanError}</span>
            )}

            <button
              onClick={runRegexScan}
              disabled={isScanning}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white transition-colors shrink-0"
            >
              {isScanning ? "Scanning…" : scanState === "done" ? "Re-scan" : "Run Regex Scan"}
            </button>
          </div>
        </div>


        {/* Hint */}
        {wordQueue.length === 0 && unredactQueue.length === 0 && (
          <p className="text-xs text-zinc-700 mb-4 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Select plain text to queue for AI check · Click a highlighted span to mark safe or redact all occurrences
          </p>
        )}

        {/* Main layout: Document + Context Panel always visible */}
        <div className="flex gap-5 items-start">
          {/* Document viewer */}
          <div className="flex-1 shadow-2xl ring-1 ring-white/10 rounded-xl overflow-hidden">
            <div className="bg-zinc-800/50 px-4 py-2.5 border-b border-zinc-800/50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex space-x-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
                <span className="text-xs font-mono text-zinc-400">resume_john_doe.txt</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-600">
                  {spans.filter((s) => s.status !== "safe").length} active ·{" "}
                  {spans.filter((s) => s.status === "safe").length} safe
                </span>
              </div>
            </div>
            <DocumentViewer
              rawText={mockRawText}
              spans={spans}
              isXRayMode={isXRayMode}
              onTextSelect={handleTextSelect}
              onMarkSafe={handleMarkSafe}
              onMarkRedacted={handleMarkRedacted}
            />
          </div>

          {/* Context Panel — always visible on the right */}
          <div className="w-72 shrink-0 sticky top-6">
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex flex-col" style={{ minHeight: "500px" }}>
              <ContextPanel
                queue={wordQueue}
                unredactQueue={unredactQueue}
                documentText={mockRawText}
                currentSpans={spans}
                onRemoveFromQueue={handleRemoveFromQueue}
                onClearQueue={() => setWordQueue([])}
                onRemoveFromUnredactQueue={handleRemoveFromUnredactQueue}
                onUpdateSpans={handleUpdateSpans}
              />
            </div>
          </div>
        </div>

        {/* Footer — Phase 4 Finalize & Export */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6 border-t border-zinc-800 mt-6">
          <div className="flex flex-col gap-1">
            {isFinalized ? (
              <p className="text-sm text-emerald-400 font-semibold">✓ Document finalized and downloaded</p>
            ) : (
              <p className="text-sm text-zinc-300 font-medium">Ready to finalize</p>
            )}
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>{spans.filter((s) => s.status !== "safe" && s.status !== "finalized").length} spans to redact</span>
              <span className="text-zinc-700">·</span>
              <span className="text-emerald-600">{spans.filter((s) => s.status === "safe").length} marked safe</span>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-600">{spans.filter((s) => s.status === "finalized").length} finalized</span>
            </div>
          </div>
          <button
            onClick={handleFinalize}
            disabled={isFinalized}
            className="px-6 py-2.5 rounded-lg font-medium text-sm transition-all shrink-0
              disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed
              enabled:bg-rose-600 enabled:hover:bg-rose-500 enabled:text-white enabled:shadow-lg enabled:shadow-rose-900/40"
          >
            {isFinalized ? "✓ Exported" : "⬛ Finalize & Export"}
          </button>
        </div>

      </div>
    </main>
  );
}
