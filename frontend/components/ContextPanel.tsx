"use client";

import { useState } from "react";
import { BatchResultItem, OccurrenceSpan, Span } from "@/lib/types";
import { batchContextCheck } from "@/lib/api";

interface ContextPanelProps {
  queue: string[];               // Words the user has selected and queued
  unredactQueue: string[];
  documentText: string;
  currentSpans: Span[];
  onRemoveFromQueue: (word: string) => void;
  onClearQueue: () => void;
  onRemoveFromUnredactQueue: (word: string) => void;
  onUpdateSpans: (spansToAdd: Span[], spanIdsToRemove: string[]) => void;
}

type PanelState = "queue" | "checking" | "results" | "error";

const PII_TYPE_LABELS: Record<string, string> = {
  person_name: "Person Name",
  organization: "Organization",
  location: "Location",
  not_pii: "Not PII",
  other: "Other PII",
};

type ResultWithApproval = BatchResultItem & {
  approved: boolean;
  selectedOccurrences: Set<number>;
  occurrenceOverlaps: (string | null)[];
};

export default function ContextPanel({
  queue,
  unredactQueue,
  documentText,
  currentSpans,
  onRemoveFromQueue,
  onClearQueue,
  onRemoveFromUnredactQueue,
  onUpdateSpans,
}: ContextPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>("queue");
  const [results, setResults] = useState<ResultWithApproval[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRunCheck() {
    if (queue.length === 0) return;
    setPanelState("checking");
    setErrorMsg(null);
    try {
      const resp = await batchContextCheck({ text: documentText, selections: queue });
      const withApprovals: ResultWithApproval[] = resp.results.map((r) => {
        const overlaps = r.occurrences.map((occ) => {
          const span = currentSpans.find(
            (s) => occ.startIndex < s.endIndex && occ.endIndex > s.startIndex
          );
          return span ? span.id : null;
        });

        // Initialize checkbox state
        const selected = new Set<number>();
        overlaps.forEach((spanId, i) => {
          if (spanId) {
            // Already redacted: start checked
            selected.add(i);
          } else if (r.is_pii) {
            // Not redacted, but AI says it's PII: auto-check
            selected.add(i);
          }
        });

        return {
          ...r,
          approved: true, // Auto-expand occurrences
          selectedOccurrences: selected,
          occurrenceOverlaps: overlaps,
        };
      });
      setResults(withApprovals);
      setPanelState("results");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setPanelState("error");
    }
  }

  function toggleApproval(idx: number) {
    setResults((prev) =>
      prev.map((r, i) =>
        i !== idx ? r : {
          ...r,
          approved: !r.approved,
          selectedOccurrences: !r.approved
            ? new Set(r.occurrences.map((_, j) => j))
            : new Set(),
        }
      )
    );
  }

  function toggleOccurrence(resultIdx: number, occIdx: number) {
    setResults((prev) =>
      prev.map((r, i) => {
        if (i !== resultIdx) return r;
        const next = new Set(r.selectedOccurrences);
        next.has(occIdx) ? next.delete(occIdx) : next.add(occIdx);
        return { ...r, selectedOccurrences: next, approved: next.size > 0 };
      })
    );
  }

  function handleApplyChanges() {
    const spansToAdd: Span[] = [];
    const spanIdsToRemove = new Set<string>();

    results.forEach((r) => {
      if (!r.approved) return;
      r.occurrences.forEach((occ, i) => {
        const isChecked = r.selectedOccurrences.has(i);
        const existingSpanId = r.occurrenceOverlaps[i];

        if (isChecked && !existingSpanId) {
          // Intended=Redact, Current=Not Redacted -> Add
          spansToAdd.push({
            id: `ctx-${Date.now()}-${r.selection}-${i}`,
            startIndex: occ.startIndex,
            endIndex: occ.endIndex,
            text: occ.text,
            type: r.pii_type,
            source: "context_check",
            confidence: r.confidence,
            systemCritical: r.confidence >= 0.8,
            status: "suggested",
          });
        } else if (!isChecked && existingSpanId) {
          // Intended=Not Redacted, Current=Redacted -> Remove
          spanIdsToRemove.add(existingSpanId);
        }
      });
    });

    onUpdateSpans(spansToAdd, Array.from(spanIdsToRemove));
    onClearQueue();
    setPanelState("queue");
    setResults([]);
  }

  function handleBack() {
    setPanelState("queue");
    setResults([]);
  }

  let addCount = 0;
  let removeCount = 0;
  results.forEach((r) => {
    if (!r.approved) return;
    r.occurrences.forEach((occ, i) => {
      const isChecked = r.selectedOccurrences.has(i);
      const existingSpanId = r.occurrenceOverlaps[i];
      if (isChecked && !existingSpanId) addCount++;
      if (!isChecked && existingSpanId) removeCount++;
    });
  });

  const totalChanges = addCount + removeCount;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            {panelState === "results" ? "AI Results" : "Word Queue"}
          </span>
        </div>
        {panelState === "results" && (
          <button
            onClick={handleBack}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            ← Back
          </button>
        )}
      </div>

      {/* ── UNREDACT QUEUE (FALSE POSITIVES) ── */}
      {unredactQueue && unredactQueue.length > 0 && (
        <div className="flex flex-col gap-3 pb-4 mb-4 border-b border-zinc-800">
          <p className="text-xs text-amber-500 font-bold uppercase tracking-wider">Fast Unredact</p>
          <div className="flex flex-col gap-2">
            {unredactQueue.map((word, i) => {
              const matchingSpans = currentSpans.filter((s) => s.text.toLowerCase() === word.toLowerCase());
              return (
                <div key={i} className="px-3 py-2.5 rounded-lg bg-amber-950/20 border border-amber-900/40">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-amber-200">"{word}"</span>
                    <button
                      onClick={() => onRemoveFromUnredactQueue(word)}
                      className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-950/30 transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-amber-500/70 mt-1">Remove {matchingSpans.length} occurrence{matchingSpans.length !== 1 ? 's' : ''}</p>
                  <button
                    onClick={() => {
                      onUpdateSpans([], matchingSpans.map((s) => s.id));
                      onRemoveFromUnredactQueue(word);
                    }}
                    className="w-full mt-2 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Unredact "{word}"
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── QUEUE STATE ── */}
      {(panelState === "queue" || panelState === "error") && (
        <div className="flex flex-col gap-3 flex-1">
          <p className="text-xs text-zinc-500">
            Highlight words in the document to add them here. Then click{" "}
            <span className="text-violet-400 font-medium">Run AI Check</span> to
            verify each one with a context-window AI analysis.
          </p>

          {/* Queue chips */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <div className="w-10 h-10 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center">
                  <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <p className="text-xs text-zinc-600">No words queued yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {queue.map((word, i) => (
                  <div
                    key={`${word}-${i}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700"
                  >
                    <span className="font-mono text-sm text-zinc-200">"{word}"</span>
                    <button
                      onClick={() => onRemoveFromQueue(word)}
                      className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-950/30 transition-colors text-xs ml-2 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {panelState === "error" && (
            <div className="px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900/50">
              <p className="text-xs text-red-400">⚠ {errorMsg}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {queue.length > 0 && (
              <button
                onClick={onClearQueue}
                className="px-3 py-2 text-xs rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleRunCheck}
              disabled={queue.length === 0}
              className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Run AI Check {queue.length > 0 && `(${queue.length})`}
            </button>
          </div>
        </div>
      )}

      {/* ── CHECKING STATE ── */}
      {panelState === "checking" && (
        <div className="flex flex-col items-center justify-center gap-4 flex-1 text-center">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-zinc-800" />
            <div className="absolute inset-0 rounded-full border-2 border-t-violet-400 animate-spin" />
          </div>
          <div>
            <p className="text-sm text-zinc-200 font-medium">Checking {queue.length} word{queue.length !== 1 ? "s" : ""}…</p>
            <p className="text-xs text-zinc-600 mt-0.5">Analysing context windows with AI</p>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            {queue.map((w, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800/50">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400/50 animate-pulse" />
                <span className="text-xs font-mono text-zinc-400">"{w}"</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTS STATE ── */}
      {panelState === "results" && results.length > 0 && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <p className="text-xs text-zinc-500">
            Review AI verdicts. Toggle approval and select which occurrences to redact.
          </p>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-1">
            {results.map((r, idx) => (
              <div
                key={idx}
                className={`rounded-xl border overflow-hidden transition-all ${
                  r.approved
                    ? "border-violet-700/50 bg-violet-950/20"
                    : "border-zinc-700/50 bg-zinc-800/40"
                }`}
              >
                {/* Result header */}
                <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-zinc-100 font-medium truncate">
                      "{r.selection}"
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          r.is_pii
                            ? "bg-rose-900/60 text-rose-300"
                            : "bg-zinc-700 text-zinc-400"
                        }`}
                      >
                        {r.is_pii ? "⚑ PII" : "✓ Not PII"}
                      </span>
                      {r.is_pii && (
                        <span className="text-xs text-zinc-500">
                          {PII_TYPE_LABELS[r.pii_type] ?? r.pii_type}
                        </span>
                      )}
                      <span className={`text-xs font-mono ml-auto ${
                        r.confidence >= 0.8 ? "text-rose-400" :
                        r.confidence >= 0.6 ? "text-amber-400" : "text-zinc-500"
                      }`}>
                        {(r.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    {r.reason && (
                      <p className="text-xs text-zinc-600 italic mt-0.5">"{r.reason}"</p>
                    )}
                  </div>
                  {/* Approve toggle */}
                  <button
                    onClick={() => toggleApproval(idx)}
                    className={`shrink-0 mt-0.5 w-8 h-5 rounded-full relative transition-colors ${
                      r.approved ? "bg-violet-500" : "bg-zinc-700"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        r.approved ? "left-3.5" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                {/* Occurrences (only when approved) */}
                {r.approved && r.occurrences.length > 0 && (
                  <div className="border-t border-zinc-700/40 px-3 py-2 flex flex-col gap-1">
                    <p className="text-xs text-zinc-600 mb-1">
                      {r.occurrences.length} occurrence{r.occurrences.length !== 1 ? "s" : ""}
                    </p>
                    {r.occurrences.map((occ, occIdx) => (
                      <button
                        key={occIdx}
                        onClick={() => toggleOccurrence(idx, occIdx)}
                        className={`flex items-center gap-2 px-2 py-1 rounded text-left w-full transition-colors ${
                          r.selectedOccurrences.has(occIdx)
                            ? "bg-violet-900/30"
                            : "hover:bg-zinc-700/30"
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                            r.selectedOccurrences.has(occIdx)
                              ? "bg-violet-500 border-violet-400"
                              : "border-zinc-600"
                          }`}
                        >
                          {r.selectedOccurrences.has(occIdx) && (
                            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 10 10" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1.5 5l2.5 2.5 4.5-4.5" />
                            </svg>
                          )}
                        </div>
                        <span className="text-xs font-mono text-zinc-400 truncate">
                          "{occ.text}"
                        </span>
                        <span className="text-xs text-zinc-700 ml-auto shrink-0">@{occ.startIndex}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Apply button */}
          <button
            onClick={handleApplyChanges}
            disabled={totalChanges === 0}
            className="w-full py-2.5 text-sm font-medium rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Apply Changes {totalChanges > 0 ? `(+${addCount} / -${removeCount})` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
