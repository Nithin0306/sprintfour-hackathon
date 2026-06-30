interface XRayToggleProps {
  isOn: boolean;
  onToggle: () => void;
}

export default function XRayToggle({ isOn, onToggle }: XRayToggleProps) {
  return (
    <div className="flex items-center space-x-3">
      <span className="text-sm font-medium text-zinc-400">Normal</span>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
          isOn ? "bg-emerald-500" : "bg-zinc-600"
        }`}
      >
        <span className="sr-only">Toggle X-Ray Mode</span>
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isOn ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
        X-Ray
      </span>
    </div>
  );
}
