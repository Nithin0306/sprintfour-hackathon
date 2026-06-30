"use client";

import { useState } from "react";
import DocumentViewer from "@/components/DocumentViewer";
import XRayToggle from "@/components/XRayToggle";
import { mockRawText, mockSpans } from "@/lib/mock";
import { detectSpans } from "@/lib/api";
import { Span } from "@/lib/types";

type ScanState = "idle" | "scanning" | "done" | "error";

export default function Home() {
  const [isXRayMode, setIsXRayMode] = useState(true);
  const [spans, setSpans] = useState<Span[]>(mockSpans);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanStats, setScanStats] = useState<{ found: number; new: number } | null>(null);

  async function handleRegexScan() {
    setScanState("scanning");
    setScanStats(null);
    try {
      const response = await detectSpans({ text: mockRawText });
      const newSpans = response.spans;
      const prevCount = spans.length;
      setSpans(newSpans);
      setScanStats({ found: newSpans.length, new: newSpans.length - prevCount });
      setScanState("done");
    } catch {
      setScanState("error");
    }
  }

  function handleReset() {
    setSpans(mockSpans);
    setScanState("idle");
    setScanStats(null);
  }

  const isScanning = scanState === "scanning";

  return (
    <main className="min-h-screen p-8 md:p-16 bg-zinc-950 text-white font-sans">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Review Redactions</h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Conseal has flagged potential PII. Review and correct below.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <XRayToggle isOn={isXRayMode} onToggle={() => setIsXRayMode(!isXRayMode)} />
          </div>
        </div>

        {/* Scan Controls */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200">Regex Scanner (Layer 1)</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Runs deterministic patterns over the document for phone, email, SSN, card, IBAN, and more.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Scan stats badge */}
            {scanState === "done" && scanStats && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {scanStats.found} spans found
                </span>
                {scanStats.new > 0 && (
                  <span className="px-2 py-1 rounded-md bg-amber-950 text-amber-400 border border-amber-800">
                    +{scanStats.new} missed by tool
                  </span>
                )}
              </div>
            )}
            {scanState === "error" && (
              <span className="text-xs text-red-400">Backend unavailable</span>
            )}

            {/* Reset button */}
            {scanState !== "idle" && (
              <button
                onClick={handleReset}
                className="px-3 py-2 text-xs rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors border border-zinc-700"
              >
                Reset to Mock
              </button>
            )}

            {/* Scan button */}
            <button
              onClick={handleRegexScan}
              disabled={isScanning}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white transition-colors"
            >
              {isScanning ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Scanning…
                </>
              ) : scanState === "done" ? (
                "Re-scan"
              ) : (
                "Run Regex Scan"
              )}
            </button>
          </div>
        </div>

        {/* Document Viewer */}
        <div className="shadow-2xl ring-1 ring-white/10 rounded-xl overflow-hidden">
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

          <DocumentViewer rawText={mockRawText} spans={spans} isXRayMode={isXRayMode} />
        </div>

        {/* Footer actions */}
        <div className="flex justify-end pt-2">
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
