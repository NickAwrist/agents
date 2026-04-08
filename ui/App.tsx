import { useState, type CSSProperties } from "react";
import { TruncateConfirmModal } from "./components/TruncateConfirmModal";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { ChatInputDock } from "./components/ChatInputDock";
import { StepsModal } from "./components/StepsModal";
import { shouldShowStepsModal } from "./components/ExecutionTrace";
import { DebugModal } from "./components/DebugModal";
import { RenameSessionModal } from "./components/RenameSessionModal";
import { OllamaDisconnectedBanner } from "./components/OllamaDisconnectedBanner";
import { SidebarBackdrop } from "./components/SidebarBackdrop";
import { ChatAppHeader } from "./components/ChatAppHeader";
import { WelcomeHome } from "./components/WelcomeHome";
import { cx } from "./styles";
import { useChatApp } from "./hooks/useChatApp";
import { useAppKeybinds } from "./hooks/useAppKeybinds";

export default function App() {
  const app = useChatApp();
  const [chatFooterInset, setChatFooterInset] = useState(104);

  const stepsModalOpen = shouldShowStepsModal(
    app.stepsModalData,
    app.streamingSteps,
    app.streamingStep,
  );

  useAppKeybinds({
    blockShortcuts:
      Boolean(app.renameSessionId) ||
      app.truncateConfirm != null ||
      Boolean(app.pendingDeleteSessionId) ||
      app.debugOpen ||
      stepsModalOpen,
    sessions: app.sessions,
    activeSessionId: app.activeSessionId,
    switchToSession: app.switchToSession,
    createSession: app.createSession,
    setSidebarOpen: app.setSidebarOpen,
    setSidebarCollapsed: app.setSidebarCollapsed,
    goToHome: app.goToHome,
    headerChatBusy: app.headerChatBusy,
  });

  return (
    <>
      {app.ollamaDisconnected && <OllamaDisconnectedBanner />}
      <div className={cx("h-screen overflow-hidden", app.ollamaDisconnected && "pt-9")}>
        <div
          className="grid h-full max-[900px]:grid-cols-1 min-[901px]:overflow-hidden min-[901px]:transition-[grid-template-columns] min-[901px]:duration-300 min-[901px]:ease-[cubic-bezier(0.22,1,0.36,1)] min-[901px]:[grid-template-columns:var(--app-sidebar-cols)]"
          style={{ ["--app-sidebar-cols" as string]: app.sidebarCols } as CSSProperties}
        >
          <aside
            id="app-sidebar"
            className={cx(
              "min-h-0 min-w-0 border-r border-border-subtle bg-background min-[901px]:w-full",
              "max-[900px]:fixed max-[900px]:top-0 max-[900px]:bottom-0 max-[900px]:left-0 max-[900px]:z-30 max-[900px]:w-[min(85vw,300px)] max-[900px]:shadow-[4px_0_24px_rgba(0,0,0,0.35)]",
              "max-[900px]:transform-gpu max-[900px]:transition-transform max-[900px]:duration-300 max-[900px]:ease-[cubic-bezier(0.22,1,0.36,1)]",
              app.sidebarOpen ? "max-[900px]:translate-x-0" : "max-[900px]:-translate-x-full",
            )}
          >
            <Sidebar
              sessions={app.sessions}
              activeSessionId={app.activeSessionId}
              onSelectSession={(id) => {
                app.setSidebarOpen(false);
                app.switchToSession(id);
              }}
              onNewSession={app.createSession}
              onRenameSession={(id) => app.setRenameSessionId(id)}
              onDeleteSession={app.requestDeleteSession}
              isLoading={app.isLoading}
              collapsed={app.sidebarCollapsed}
              onToggleCollapsed={() => app.setSidebarCollapsed((value) => !value)}
            />
          </aside>

          <SidebarBackdrop open={app.sidebarOpen} onClose={() => app.setSidebarOpen(false)} />

          <main className="relative min-h-0 min-w-0 bg-background">
            <ChatAppHeader
              activeSessionId={app.activeSessionId}
              sidebarOpen={app.sidebarOpen}
              onOpenSidebar={() => app.setSidebarOpen(true)}
              ollamaModels={app.ollamaModels}
              modelsLoadError={app.modelsLoadError}
              selectedModel={app.selectedModel}
              onModelChange={app.handleModelChange}
              headerChatBusy={app.headerChatBusy}
              debugOpen={app.debugOpen}
              onToggleDebug={app.toggleDebug}
            />

            <section className={cx("flex h-full min-h-0 overflow-x-hidden", !app.activeSessionId && "pt-0")}>
              {app.activeSessionId ? (
                <div
                  key={app.activeSessionId}
                  className="ui-animate-fade-in flex h-full min-h-0 min-w-0 flex-1 flex-col"
                >
                  <ChatArea
                    messages={app.messages}
                    streamingSteps={app.streamingSteps}
                    streamingStep={app.streamingStep}
                    streamingContent={app.streamingContent}
                    chatPending={app.chatPending}
                    footerInset={chatFooterInset}
                    onViewSteps={app.setStepsModalData}
                    editingUserIndex={app.editingUserIndex}
                    onStartEditUser={app.setEditingUserIndex}
                    onCancelEditUser={() => app.setEditingUserIndex(null)}
                    onRequestEditConfirm={(userIndex, text) =>
                      app.setTruncateConfirm({ kind: "edit", userIndex, text })
                    }
                    onRequestRetryConfirm={(userIndex) => app.setTruncateConfirm({ kind: "retry", userIndex })}
                  />
                </div>
              ) : (
                <WelcomeHome
                  key="home"
                  sessions={app.sessions}
                  isLoading={app.isLoading}
                  onNewChat={app.createSession}
                  onOpenSession={app.switchToSession}
                />
              )}
            </section>

            {app.activeSessionId && (
              <ChatInputDock
                key={app.activeSessionId}
                input={app.input}
                setInput={app.setInput}
                onSendMessage={app.sendMessage}
                chatPending={app.chatPending}
                streamingStep={app.streamingStep}
                streamingSteps={app.streamingSteps}
                ollamaReady={app.ollamaReady}
                onFooterHeightChange={setChatFooterInset}
              />
            )}
          </main>
        </div>

        {app.debugOpen && (
          <DebugModal
            data={app.debugData}
            ollamaConnected={app.ollamaConnected}
            onClose={() => app.setDebugOpen(false)}
          />
        )}
        {stepsModalOpen && (
          <StepsModal
            steps={app.modalSteps ?? []}
            streamingThinking={app.stepsModalData === "live" ? app.streamingThinking : undefined}
            onClose={() => app.setStepsModalData(null)}
          />
        )}
        {app.renameSessionId && (
          <RenameSessionModal
            initialTitle={app.renameTarget?.preview ?? ""}
            onSave={app.saveSessionTitle}
            onClose={() => app.setRenameSessionId(null)}
          />
        )}
        {app.truncateConfirm && (
          <TruncateConfirmModal
            title="Delete later messages?"
            description="All message history after this point will be permanently deleted. This cannot be undone."
            onClose={() => app.setTruncateConfirm(null)}
            onConfirm={app.confirmTruncateAndRetry}
          />
        )}
        {app.pendingDeleteSessionId && (
          <TruncateConfirmModal
            title="Delete this chat?"
            description="This chat and all of its messages will be permanently deleted. This cannot be undone."
            confirmLabel="Delete"
            onClose={() => app.setPendingDeleteSessionId(null)}
            onConfirm={app.performDeleteSession}
          />
        )}
      </div>
    </>
  );
}
