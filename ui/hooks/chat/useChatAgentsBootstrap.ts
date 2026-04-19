import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AgentData,
  fetchAgents,
  fetchDefaultChatAgent,
} from "../../persist/agents";

export function useChatAgentsBootstrap() {
  const [chatAgents, setChatAgents] = useState<{ name: string }[]>([]);
  const [serverDefaultChatAgent, setServerDefaultChatAgent] =
    useState("general_agent");
  /** Keeps the full agent records (including `system_prompt`) for client-side rendering. */
  const agentMapRef = useRef<Map<string, AgentData>>(new Map());

  const apply = useCallback((list: AgentData[], def: string) => {
    agentMapRef.current = new Map(list.map((a) => [a.name, a]));
    setChatAgents(list.map((a) => ({ name: a.name })));
    setServerDefaultChatAgent(def);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, def] = await Promise.all([
          fetchAgents(),
          fetchDefaultChatAgent(),
        ]);
        if (cancelled) return;
        apply(list, def);
      } catch {
        if (!cancelled) {
          setChatAgents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const refreshAgentDefaults = useCallback(async () => {
    try {
      const [list, def] = await Promise.all([
        fetchAgents(),
        fetchDefaultChatAgent(),
      ]);
      apply(list, def);
    } catch {
      /* ignore */
    }
  }, [apply]);

  return {
    chatAgents,
    serverDefaultChatAgent,
    setServerDefaultChatAgent,
    refreshAgentDefaults,
    agentMapRef,
  };
}
