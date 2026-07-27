export function SessionTransition({ phase }: { phase: "showing" | "fading" }) {
  return (
    <div
      className={`fixed inset-0 z-[100] bg-sidebar flex flex-col items-center justify-center transition-opacity duration-500 ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex gap-2 mb-5">
        <span className="w-3 h-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-3 h-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-3 h-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <p className="text-white font-semibold text-sm">Session active</p>
      <p className="text-white/50 text-xs mt-1">Redirecting you to your dashboard…</p>
    </div>
  );
}