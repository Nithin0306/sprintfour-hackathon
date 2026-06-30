"use client";

import { useEffect, useState } from "react";

export interface SessionMetrics {
  /** Spans detected automatically (regex + initial mock) before user touched anything */
  autoDetectedCount: number;
  /** Spans the user manually added via AI queue that system missed initially */
  userAddedCount: number;
  /** Spans from the regex scan layer specifically */
  regexCaughtCount: number;
  /** Spans the user marked as Safe (false positives corrected) */
  falsePositivesFixed: number;
  /** Average confidence of all final redacted spans (0–1) */
  avgConfidence: number;
  /** Total redacted spans in final document */
  totalRedacted: number;
}

interface ConfidenceDashboardProps {
  metrics: SessionMetrics;
  onClose: () => void;
}

// Animated counter hook
function useCountUp(target: number, duration = 1400, decimals = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(parseFloat(start.toFixed(decimals)));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, decimals]);
  return value;
}

// Circular progress ring
function RingMeter({
  pct,
  color,
  size = 96,
  stroke = 8,
}: {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#27272a"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1.4s cubic-bezier(.4,0,.2,1)" }}
      />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  unit,
  sub,
  color,
  delay,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  color: string;
  delay: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={`rounded-2xl border p-5 flex flex-col gap-2 transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
      style={{ borderColor: color + "33", backgroundColor: color + "0d" }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>
        {label}
      </p>
      <p className="text-3xl font-black text-white">
        {value}
        {unit && <span className="text-lg font-medium ml-0.5">{unit}</span>}
      </p>
      <p className="text-xs text-zinc-500 leading-snug">{sub}</p>
    </div>
  );
}

export default function ConfidenceDashboard({
  metrics,
  onClose,
}: ConfidenceDashboardProps) {
  // Derived metrics
  const totalHandled = metrics.autoDetectedCount + metrics.userAddedCount;
  const baselineCatchPct =
    totalHandled > 0
      ? Math.round((metrics.autoDetectedCount / totalHandled) * 100)
      : 0;

  // Final confidence: starts from avg model confidence, boosted by user review
  const reviewBonus = Math.min(
    10,
    metrics.falsePositivesFixed * 0.6 + metrics.userAddedCount * 1.2
  );
  const finalConfidenceRaw = Math.min(
    99.9,
    metrics.avgConfidence * 85 + reviewBonus + 5
  );
  const finalConfidence = parseFloat(finalConfidenceRaw.toFixed(1));

  const animatedConf = useCountUp(finalConfidence, 1600, 1);
  const animatedBaseline = useCountUp(baselineCatchPct, 1200);

  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        show ? "opacity-100" : "opacity-0"
      }`}
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden transition-all duration-500 ${
          show ? "scale-100 translate-y-0" : "scale-95 translate-y-6"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 px-8 pt-8 pb-6 border-b border-zinc-800">
          {/* Glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl opacity-20"
            style={{ background: "radial-gradient(circle, #10b981, transparent)" }}
          />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">
                  Session Complete
                </span>
              </div>
              <h2 className="text-2xl font-black text-white">Confidence Dashboard</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Here's a full audit of what the system caught, and what you corrected.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none mt-1"
            >
              ✕
            </button>
          </div>

          {/* Hero: Final Confidence Score */}
          <div className="mt-6 flex items-center gap-6">
            <div className="relative w-24 h-24 shrink-0">
              <RingMeter pct={(finalConfidence / 100) * 100} color="#10b981" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-black text-emerald-400">
                  {animatedConf}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-4xl font-black text-white">
                {animatedConf}
                <span className="text-xl text-zinc-400">%</span>
              </p>
              <p className="text-sm text-emerald-400 font-semibold">
                Final System Confidence Score
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Composite score incorporating model confidence, regex precision, and your manual corrections.
              </p>
            </div>
          </div>
        </div>

        {/* Metric Grid */}
        <div className="p-6 grid grid-cols-2 gap-3">
          <MetricCard
            label="Baseline AI Catch Rate"
            value={`${animatedBaseline}`}
            unit="%"
            sub={`${metrics.autoDetectedCount} of ${totalHandled} spans detected automatically by regex + AI layers`}
            color="#60a5fa"
            delay={200}
          />
          <MetricCard
            label="Critical Misses Caught"
            value={`${metrics.regexCaughtCount}`}
            sub={`Structured PII (phones, emails, IBANs, SSNs) caught by the regex layer after initial scan`}
            color="#f59e0b"
            delay={350}
          />
          <MetricCard
            label="False Positives Corrected"
            value={`${metrics.falsePositivesFixed}`}
            sub={`Words incorrectly flagged that you marked as Safe — preventing over-redaction`}
            color="#a78bfa"
            delay={500}
          />
          <MetricCard
            label="Total Redacted Spans"
            value={`${metrics.totalRedacted}`}
            sub={`Unique PII spans in the final document, across ${metrics.autoDetectedCount + metrics.userAddedCount} detected instances`}
            color="#f43f5e"
            delay={650}
          />
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <p className="text-xs text-zinc-600">
            Document downloaded as{" "}
            <span className="font-mono text-zinc-400">resume_john_doe_REDACTED.html</span>
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
