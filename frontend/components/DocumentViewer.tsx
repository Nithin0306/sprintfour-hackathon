import { Span } from "@/lib/types";

interface DocumentViewerProps {
  rawText: string;
  spans: Span[];
  isXRayMode: boolean;
}

export default function DocumentViewer({ rawText, spans, isXRayMode }: DocumentViewerProps) {
  // Sort spans by startIndex just to be safe
  const sortedSpans = [...spans].sort((a, b) => a.startIndex - b.startIndex);

  // Split rawText into chunks of plain text and spans
  const chunks: { type: "plain" | "span"; text: string; span?: Span }[] = [];
  let currentIndex = 0;

  for (const span of sortedSpans) {
    if (span.startIndex > currentIndex) {
      // Add plain text before the span
      chunks.push({
        type: "plain",
        text: rawText.substring(currentIndex, span.startIndex),
      });
    }
    // Add the span itself
    chunks.push({
      type: "span",
      text: rawText.substring(span.startIndex, span.endIndex),
      span,
    });
    currentIndex = span.endIndex;
  }

  // Add any remaining plain text after the last span
  if (currentIndex < rawText.length) {
    chunks.push({
      type: "plain",
      text: rawText.substring(currentIndex),
    });
  }

  return (
    <div
      className={`p-6 rounded-lg bg-white text-zinc-900 border border-zinc-200 font-serif leading-relaxed whitespace-pre-wrap ${
        isXRayMode ? "xray-mode" : "plain-mode"
      }`}
    >
      {chunks.map((chunk, index) => {
        if (chunk.type === "plain") {
          return <span key={index}>{chunk.text}</span>;
        }

        const span = chunk.span!;
        const isTripwire = span.systemCritical && span.confidence < 0.5 && span.status === "suggested";
        
        let spanClass = `span-base span-${span.status}`;
        if (isTripwire) spanClass += " span-tripwire";

        return (
          <span
            key={span.id}
            data-span-id={span.id}
            className={spanClass}
            title={`${span.type} (${(span.confidence * 100).toFixed(0)}%)`}
          >
            {chunk.text}
          </span>
        );
      })}
    </div>
  );
}
