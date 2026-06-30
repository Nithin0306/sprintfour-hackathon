"use client";

import { useRef, useState } from "react";
import { Span } from "@/lib/types";

interface DocumentViewerProps {
  rawText: string;
  spans: Span[];
  isXRayMode: boolean;
  onTextSelect?: (selection: string) => void;
  onMarkSafe?: (text: string) => void;
  onMarkRedacted?: (text: string) => void;
}

interface PopoverState {
  spanText: string;
  spanStatus: string;
  spanType: string;
  x: number;
  y: number;
  occurrenceCount: number;
}

export default function DocumentViewer({
  rawText,
  spans,
  isXRayMode,
  onTextSelect,
  onMarkSafe,
  onMarkRedacted,
}: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  // Sort spans by startIndex
  const sortedSpans = [...spans].sort((a, b) => a.startIndex - b.startIndex);

  // Split rawText into chunks
  const chunks: { type: "plain" | "span"; text: string; span?: Span; startOffset: number }[] = [];
  let currentIndex = 0;

  for (const span of sortedSpans) {
    if (span.startIndex > currentIndex) {
      chunks.push({
        type: "plain",
        text: rawText.substring(currentIndex, span.startIndex),
        startOffset: currentIndex,
      });
    }
    chunks.push({
      type: "span",
      text: rawText.substring(span.startIndex, span.endIndex),
      span,
      startOffset: span.startIndex,
    });
    currentIndex = span.endIndex;
  }

  if (currentIndex < rawText.length) {
    chunks.push({
      type: "plain",
      text: rawText.substring(currentIndex),
      startOffset: currentIndex,
    });
  }

  function handleMouseUp() {
    if (!onTextSelect) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const selectedText = selection.toString().trim();
    if (selectedText.length < 2) return;
    setPopover(null);
    onTextSelect(selectedText);
  }

  function handleSpanClick(e: React.MouseEvent, span: Span, text: string) {
    e.stopPropagation();
    // Don't show popover for safe spans in plain mode — they look like normal text
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    // Count occurrences of this word in current spans
    const lower = text.toLowerCase();
    const occurrenceCount = spans.filter(
      (s) => s.text.toLowerCase() === lower && s.status !== "safe"
    ).length;

    setPopover({
      spanText: text,
      spanStatus: span.status,
      spanType: span.type,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.bottom - containerRect.top + 6,
      occurrenceCount,
    });
  }

  function closePopover() {
    setPopover(null);
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onClick={closePopover}
    >
      <div
        onMouseUp={handleMouseUp}
        className={`p-6 bg-white text-zinc-900 font-serif leading-relaxed whitespace-pre-wrap select-text cursor-text ${
          isXRayMode ? "xray-mode" : "plain-mode"
        }`}
      >
        {chunks.map((chunk, index) => {
          if (chunk.type === "plain") {
            return (
              <span key={`plain-${index}`} data-offset={chunk.startOffset}>
                {chunk.text}
              </span>
            );
          }

          const span = chunk.span!;
          let spanClass = `span-base span-${span.status}`;

          return (
            <span
              key={span.id}
              data-span-id={span.id}
              data-offset={chunk.startOffset}
              className={`${spanClass} cursor-pointer hover:ring-2 hover:ring-violet-400/50 transition-all`}
              title={`${span.type} · ${(span.confidence * 100).toFixed(0)}% · ${span.source} (Click to manage)`}
              onClick={(e) => handleSpanClick(e, span, chunk.text)}
            >
              {chunk.text}
            </span>
          );
        })}
      </div>

      {/* Popover */}
      {popover && (
        <div
          className="absolute z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 w-56"
          style={{ left: Math.max(0, popover.x - 112), top: popover.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-zinc-300 truncate max-w-[160px]">
              "{popover.spanText}"
            </span>
            <button
              onClick={closePopover}
              className="text-zinc-600 hover:text-zinc-300 text-xs ml-1 shrink-0"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">
              {popover.spanType.replace("_", " ")}
            </span>
            {popover.spanStatus === "safe" && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400">
                Marked Safe
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-500 mb-3">
            {popover.occurrenceCount} active occurrence{popover.occurrenceCount !== 1 ? "s" : ""} found
          </p>

          <div className="flex flex-col gap-1.5">
            {popover.spanStatus !== "safe" && (
              <>
                <button
                  onClick={() => {
                    onMarkSafe?.(popover.spanText);
                    closePopover();
                  }}
                  className="w-full py-1.5 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
                >
                  ✓ Mark Safe (False Positive)
                </button>
                <button
                  onClick={() => {
                    onMarkRedacted?.(popover.spanText);
                    closePopover();
                  }}
                  className="w-full py-1.5 text-xs font-medium rounded-lg bg-rose-700 hover:bg-rose-600 text-white transition-colors"
                >
                  ⬛ Redact All {popover.occurrenceCount} Occurrence{popover.occurrenceCount !== 1 ? "s" : ""}
                </button>
              </>
            )}
            {popover.spanStatus === "safe" && (
              <button
                onClick={() => {
                  onMarkRedacted?.(popover.spanText);
                  closePopover();
                }}
                className="w-full py-1.5 text-xs font-medium rounded-lg bg-rose-700 hover:bg-rose-600 text-white transition-colors"
              >
                ↩ Re-redact this word
              </button>
            )}
            <button
              onClick={() => {
                onTextSelect?.(popover.spanText);
                closePopover();
              }}
              className="w-full py-1.5 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              🔍 Queue for AI Check
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
