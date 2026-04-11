import { useCallback, useEffect, useState } from "react";
import { fetchAgents, fetchDefaultChatAgent } from "../../persist/agents";

export function useChatAgentsBootstrap() {
  const [chatAgents, setChatAgents] = useState<{ name: string }[]>([]);
  const [serverDefaultChatAgent, setServerDefaultChatAgent] = useState("general_agent");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, def] = await Promise.all([fetchAgents(), fetchDefaultChatAgent()]);
        if (cancelled) return;
        setChatAgents(list.map((a) => ({ name: a.name })));
        setServerDefaultChatAgent(def);
      } catch {
        if (!cancelled) {
          setChatAgents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAgentDefaults = useCallback(async () => {
    try {
      const [list, def] = await Promise.all([fetchAgents(), fetchDefaultChatAgent()]);
      setChatAgents(list.map((a) => ({ name: a.name })));
      setServerDefaultChatAgent(def);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    chatAgents,
    serverDefaultChatAgent,
    setServerDefaultChatAgent,
    refreshAgentDefaults,
  };
}
