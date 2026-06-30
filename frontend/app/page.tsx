"use client";

import { useState } from "react";
import DocumentViewer from "@/components/DocumentViewer";
import XRayToggle from "@/components/XRayToggle";
import { mockRawText, mockSpans } from "@/lib/mock";

export default function Home() {
  const [isXRayMode, setIsXRayMode] = useState(true);

  return (
    <main className="min-h-screen p-8 md:p-24 bg-zinc-950 text-white font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Review Redactions</h1>
            <p className="text-zinc-400 mt-2">
              Conseal has flagged potential PII. Review the document below.
            </p>
          </div>
          
          <div className="mt-6 md:mt-0">
            <XRayToggle isOn={isXRayMode} onToggle={() => setIsXRayMode(!isXRayMode)} />
          </div>
        </div>

        {/* Document Viewer Section */}
        <div className="shadow-2xl ring-1 ring-white/10 rounded-xl overflow-hidden">
          <div className="bg-zinc-800/50 px-4 py-3 border-b border-zinc-800/50 flex items-center space-x-3">
            <div className="flex space-x-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="text-xs font-mono text-zinc-400">document.txt</span>
          </div>
          
          <DocumentViewer 
            rawText={mockRawText} 
            spans={mockSpans} 
            isXRayMode={isXRayMode} 
          />
        </div>

        {/* Action Bar (Placeholder for Phase 4) */}
        <div className="flex justify-end pt-4">
          <button className="px-6 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg font-medium hover:bg-zinc-700 transition-colors cursor-not-allowed opacity-50" disabled>
            Finalize Export
          </button>
        </div>

      </div>
    </main>
  );
}
