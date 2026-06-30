"use client";

import { useEffect, useState } from "react";
import { pingBackend } from "@/lib/api";

export default function Home() {
  const [pingStatus, setPingStatus] = useState<string>("Loading...");

  useEffect(() => {
    pingBackend()
      .then((data) => setPingStatus(`Backend status: ${data.status}`))
      .catch((err) => setPingStatus(`Backend error: ${err.message}`));
  }, []);

  return (
    <main className="min-h-screen p-24 bg-zinc-950 text-white font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          Conseal Phase 0
        </h1>
        <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 shadow-xl">
          <p className="text-lg text-zinc-300">
            {pingStatus}
          </p>
        </div>
      </div>
    </main>
  );
}
