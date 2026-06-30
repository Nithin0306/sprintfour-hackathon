"use client";

import { useRef } from "react";
import { Span } from "@/lib/types";

interface DocumentViewerProps {
  rawText: string;
  spans: Span[];
  isXRayMode: boolean;
  onTextSelect?: (selection: string) => void;
}

export default function DocumentViewer({
  rawText,
  spans,
  isXRayMode,
  onTextSelect,
}: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort spans by startIndex
  const sortedSpans = [...spans].sort((a, b) => a.startIndex - b.startIndex);

  // Split rawText into chunks of plain text and spans
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
    onTextSelect(selectedText);
  }

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className={`p-6 rounded-lg bg-white text-zinc-900 border border-zinc-200 font-serif leading-relaxed whitespace-pre-wrap select-text cursor-text ${
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
        const isTripwire =
          span.systemCritical && span.confidence < 0.5 && span.status === "suggested";

        let spanClass = `span-base span-${span.status}`;
        if (isTripwire) spanClass += " span-tripwire";
        else if (span.status === "suggested") spanClass += " span-suggested";

        return (
          <span
            key={span.id}
            data-span-id={span.id}
            data-offset={chunk.startOffset}
            className={`${spanClass} cursor-pointer hover:ring-2 hover:ring-violet-400/50 transition-all`}
            title={`${span.type} · ${(span.confidence * 100).toFixed(0)}% · ${span.source} (Click to select)`}
            onClick={(e) => {
              e.stopPropagation();
              if (onTextSelect) onTextSelect(chunk.text);
            }}
          >
            {chunk.text}
          </span>
        );
      })}
    </div>
  );
}
