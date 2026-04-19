import { type WireMessage, persistSessionMessages } from "../db/index";

/**
 * Persistence boundary for a single chat turn. All calls are no-ops for
 * ephemeral turns, so the caller never has to branch on that itself.
 */
export type ChatPersistence = {
  saveInitial(
    history: WireMessage[],
    userMessage: string,
    modelMessages: Array<Record<string, unknown>> | null,
  ): void;
  saveFinal(
    history: WireMessage[],
    modelMessages: Array<Record<string, unknown>> | null,
  ): void;
};

export function createChatPersistence(opts: {
  sessionId: string;
  model: string;
  ephemeral: boolean;
}): ChatPersistence {
  if (opts.ephemeral) {
    return { saveInitial: () => {}, saveFinal: () => {} };
  }
  const save = (
    history: WireMessage[],
    modelMessages: Array<Record<string, unknown>> | null,
  ) => {
    persistSessionMessages(
      opts.sessionId,
      history,
      modelMessages,
      Date.now(),
      opts.model,
    );
  };
  return {
    saveInitial(history, userMessage, modelMessages) {
      save([...history, { role: "user", content: userMessage }], modelMessages);
    },
    saveFinal(history, modelMessages) {
      save(history, modelMessages);
    },
  };
}
