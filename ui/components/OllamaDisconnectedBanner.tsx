export function OllamaDisconnectedBanner() {
  return (
    <div
      className="ui-animate-fade-in fixed inset-x-0 top-0 z-[60] flex h-9 items-center justify-center border-b border-red-500/20 bg-red-950/55 px-4 text-center text-[0.75rem] font-medium leading-none text-red-100/95 backdrop-blur-md backdrop-saturate-150 [box-shadow:inset_0_-1px_0_0_rgba(255,255,255,0.04)]"
      role="status"
      aria-live="polite"
    >
      Ollama is disconnected — start Ollama to send messages.
    </div>
  );
}
