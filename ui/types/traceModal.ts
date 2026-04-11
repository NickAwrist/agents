import type { MessageStep } from "./chat";

/** Steps modal: persisted steps, live SSE, or closed. */
export type TraceModalSelection = MessageStep[] | "live" | null;

/** Opening the trace modal with saved steps or the live stream. */
export type TraceModalOpenPayload = MessageStep[] | "live";
