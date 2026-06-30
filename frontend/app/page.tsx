"use client";

import { useState } from "react";
import DocumentViewer from "@/components/DocumentViewer";
import XRayToggle from "@/components/XRayToggle";
import ContextPanel from "@/components/ContextPanel";
import { mockRawText, mockSpans } from "@/lib/mock";
import { detectRegex } from "@/lib/api";
import { Span } from "@/lib/types";

type ScanState = "idle" | "scanning" | "done" | "error";

export default function Home() {
  const [isXRayMode, setIsXRayMode] = useState(true);
  
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
  const [scanStats, setScanStats] = useState<{ found: number; diff: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Word queue for the context panel
  const [wordQueue, setWordQueue] = useState<string[]>([]);

  async function runRegexScan() {
    setScanState("scanning");
    setScanStats(null);
    setScanError(null);
    const prev = spans.length;
    try {
      const res = await detectRegex({ text: mockRawText });
      pushHistory(res.spans);
      setScanStats({ found: res.spans.length, diff: res.spans.length - prev });
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
  }

  const MAX_QUEUE_SIZE = 5;

  function handleTextSelect(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 2) return;
    
    setWordQueue((prev) => {
      if (prev.includes(trimmed)) return prev;
      if (prev.length >= MAX_QUEUE_SIZE) {
        alert("You can only queue up to 5 words at a time. Please run the AI Check on these first.");
        return prev;
      }
      return [...prev, trimmed];
    });
  }

  function handleRemoveFromQueue(word: string) {
    setWordQueue((prev) => prev.filter((w) => w !== word));
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

            {/* Inline stats */}
            {scanState === "done" && scanStats && (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs">
                  {scanStats.found} spans
                </span>
                {scanStats.diff > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-950 text-amber-400 border border-amber-800 text-xs">
                    +{scanStats.diff}
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
        {wordQueue.length === 0 && (
          <p className="text-xs text-zinc-700 mb-4 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Select any word or phrase in the document to add it to the AI queue on the right
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
                <span className="text-xs font-mono text-zinc-400">patient_intake_form.txt</span>
              </div>
              <span className="text-xs text-zinc-600">
                {spans.length} span{spans.length !== 1 ? "s" : ""}
              </span>
            </div>
            <DocumentViewer
              rawText={mockRawText}
              spans={spans}
              isXRayMode={isXRayMode}
              onTextSelect={handleTextSelect}
            />
          </div>

          {/* Context Panel — always visible on the right */}
          <div className="w-72 shrink-0 sticky top-6">
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex flex-col" style={{ minHeight: "500px" }}>
              <ContextPanel
                queue={wordQueue}
                documentText={mockRawText}
                currentSpans={spans}
                onRemoveFromQueue={handleRemoveFromQueue}
                onClearQueue={() => setWordQueue([])}
                onUpdateSpans={handleUpdateSpans}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-6">
          <button
            disabled
            className="px-6 py-2.5 bg-zinc-800 text-zinc-500 rounded-lg font-medium cursor-not-allowed opacity-50 text-sm"
          >
            Finalize Export
          </button>
        </div>

      </div>
    </main>
  );
}
