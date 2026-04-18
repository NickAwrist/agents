import { useCallback, useRef, useState } from "react";
import type { DebugData, Message, TraceModalSelection, TruncateConfirmState } from "../types";
import type { ChatFlightApi } from "./chat/chatTypes";
import { traceStepsForModal } from "../components/ExecutionTrace";
import { useOllamaConnection } from "./chat/useOllamaConnection";
import { useComfyUIConnection } from "./chat/useComfyUIConnection";
import { useChatAgentsBootstrap } from "./chat/useChatAgentsBootstrap";
import { useSettings } from "./chat/useSettings";
import { useSessionsAndNavigation } from "./chat/useSessionsAndNavigation";
import { useChatStreaming } from "./chat/useChatStreaming";

export function useChatApp() {
  const ollama = useOllamaConnection();
  const comfy = useComfyUIConnection();
  const agents = useChatAgentsBootstrap();

  const activeSessionIdRef = useRef<string | null>(null);
  const isEphemeralRef = useRef(false);
  const selectedSessionAgentRef = useRef("general_agent");
  const modelMessagesRef = useRef<Array<Record<string, unknown>> | null>(null);
  const debugOpenRef = useRef(false);
  const resetStreamingUiRef = useRef<() => void>(() => {});
  const chatFlightRef = useRef<ChatFlightApi | null>(null);

  const bindStreamingReset = useCallback((fn: () => void) => {
    resetStreamingUiRef.current = fn;
  }, []);

  const resetStreamingUi = useCallback(() => resetStreamingUiRef.current(), []);

  const settings = useSettings(
    ollama.setOllamaHost,
    ollama.fetchOllamaHealth,
    ollama.refreshOllamaModels,
    comfy.fetchComfyUIHealth,
    comfy.applyComfyConfigResponse,
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [stepsModalData, setStepsModalData] = useState<TraceModalSelection>(null);
  const [editingUserIndex, setEditingUserIndex] = useState<number | null>(null);
  const [truncateConfirm, setTruncateConfirm] = useState<TruncateConfirmState>(null);

  debugOpenRef.current = debugOpen;

  const sessions = useSessionsAndNavigation({
    ollamaModels: ollama.ollamaModels,
    serverDefaultModel: ollama.serverDefaultModel,
    serverDefaultChatAgent: agents.serverDefaultChatAgent,
    setServerDefaultChatAgent: agents.setServerDefaultChatAgent,
    userSettingsRef: settings.userSettingsRef,
    userSettingsDefaultModel: settings.userSettings.defaultModel,
    messages,
    setMessages,
    setEditingUserIndex,
    setTruncateConfirm,
    setStepsModalData,
    setDebugOpen,
    setDebugData,
    resetStreamingUi,
    modelMessagesRef,
    activeSessionIdRef,
    isEphemeralRef,
    selectedSessionAgentRef,
    chatFlightRef,
  });

  const stream = useChatStreaming({
    messages,
    setMessages,
    activeSessionId: sessions.activeSessionId,
    activeSessionIdRef,
    isEphemeralRef,
    userSettingsRef: settings.userSettingsRef,
    selectedSessionAgentRef,
    sessionDirectoryRef: sessions.sessionDirectoryRef,
    modelMessagesRef,
    debugOpenRef,
    debugOpen,
    setDebugOpen,
    debugData,
    setDebugData,
    stepsModalData,
    setStepsModalData,
    selectedModel: sessions.selectedModel,
    ollamaSendReady: ollama.ollamaSendReady,
    refreshSessions: sessions.refreshSessions,
    fetchOllamaHealth: ollama.fetchOllamaHealth,
    bindStreamingReset,
    editingUserIndex,
    setEditingUserIndex,
    truncateConfirm,
    setTruncateConfirm,
    chatFlightRef,
  });

  const modalSteps = traceStepsForModal(
    stepsModalData,
    stream.streamingSteps,
    stream.streamingStep,
  );

  return {
    sessions: sessions.sessions,
    activeSessionId: sessions.activeSessionId,
    messages,
    input: stream.input,
    setInput: stream.setInput,
    streamingStep: stream.streamingStep,
    streamingSteps: stream.streamingSteps,
    streamingContent: stream.streamingContent,
    streamingThinking: stream.streamingThinking,
    debugOpen,
    setDebugOpen,
    debugData,
    stepsModalData,
    setStepsModalData,
    isLoading: sessions.isLoading,
    sidebarOpen: sessions.sidebarOpen,
    setSidebarOpen: sessions.setSidebarOpen,
    sidebarCollapsed: sessions.sidebarCollapsed,
    setSidebarCollapsed: sessions.setSidebarCollapsed,
    renameSessionId: sessions.renameSessionId,
    setRenameSessionId: sessions.setRenameSessionId,
    editingUserIndex,
    setEditingUserIndex,
    truncateConfirm,
    setTruncateConfirm,
    pendingDeleteSessionId: sessions.pendingDeleteSessionId,
    setPendingDeleteSessionId: sessions.setPendingDeleteSessionId,
    chatPending: stream.chatPending,
    ollamaModels: ollama.ollamaModels,
    modelsLoadError: ollama.modelsLoadError,
    selectedModel: sessions.selectedModel,
    chatAgents: agents.chatAgents,
    selectedSessionAgent: sessions.selectedSessionAgent,
    sessionDirectory: sessions.sessionDirectory,
    setSessionDirectoryDraft: sessions.setSessionDirectoryDraft,
    persistSessionDirectory: sessions.persistSessionDirectory,
    handleSessionAgentChange: sessions.handleSessionAgentChange,
    refreshAgentDefaults: agents.refreshAgentDefaults,
    ollamaConnected: ollama.ollamaConnected,
    ollamaDisconnected: ollama.ollamaDisconnected,
    ollamaReady: ollama.ollamaReady,
    ollamaSendReady: ollama.ollamaSendReady,
    handleModelChange: sessions.handleModelChange,
    isEphemeral: sessions.isEphemeral,
    userSettings: settings.userSettings,
    ollamaHost: ollama.ollamaHost,
    comfyuiHost: comfy.comfyuiHost,
    comfyuiConnected: comfy.comfyuiConnected,
    comfyuiDefaultModel: comfy.comfyuiDefaultModel,
    comfyuiDefaultWidth: comfy.comfyuiDefaultWidth,
    comfyuiDefaultHeight: comfy.comfyuiDefaultHeight,
    comfyuiNegativePrompt: comfy.comfyuiNegativePrompt,
    saveUserSettings: settings.saveUserSettings,
    switchToSession: sessions.switchToSession,
    createSession: sessions.createSession,
    createEphemeralSession: sessions.createEphemeralSession,
    goToHome: sessions.goToHome,
    sendMessage: stream.sendMessage,
    stopGeneration: stream.stopGeneration,
    confirmTruncateAndRetry: stream.confirmTruncateAndRetry,
    toggleDebug: stream.toggleDebug,
    requestDeleteSession: sessions.requestDeleteSession,
    performDeleteSession: sessions.performDeleteSession,
    saveSessionTitle: sessions.saveSessionTitle,
    modalSteps,
    renameTarget: sessions.renameTarget,
    headerChatBusy: stream.headerChatBusy,
    sidebarCols: sessions.sidebarCols,
  };
}
