const selectClass =
  "max-w-[min(100%,14rem)] cursor-pointer appearance-none rounded-lg border border-transparent bg-transparent py-1.5 pl-2 pr-8 text-[0.8125rem] font-medium text-foreground outline-none transition-[border-color,background-color,color] duration-150 hover:bg-muted/60 focus-visible:border-border focus-visible:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-45";

export function AgentSelectBar({
  agents,
  selectedAgent,
  onAgentChange,
  disabled,
}: {
  agents: { name: string }[];
  selectedAgent: string;
  onAgentChange: (name: string) => void;
  disabled: boolean;
}) {
  const names = new Set(agents.map((a) => a.name));
  const showSelectedNotListed = Boolean(selectedAgent && agents.length > 0 && !names.has(selectedAgent));

  return (
    <div className="relative min-w-0">
      <label htmlFor="chat-agent" className="sr-only">
        Agent
      </label>
      <select
        id="chat-agent"
        value={selectedAgent}
        onChange={(e) => onAgentChange(e.target.value)}
        disabled={disabled}
        className={selectClass}
      >
        {agents.length === 0 ? (
          <option value={selectedAgent}>{selectedAgent || "Agent"}</option>
        ) : (
          <>
            {showSelectedNotListed && (
              <option value={selectedAgent}>{selectedAgent} (missing)</option>
            )}
            {agents.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </>
        )}
      </select>
      <span
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}
