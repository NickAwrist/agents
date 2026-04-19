import crypto from "node:crypto";
import { type Request, Router } from "express";
import {
  type WireMessage,
  createSessionRow,
  deleteSessionRow,
  getMessagesForSession,
  getSessionById,
  listSessionSummaries,
  parseModelMessages,
  patchSessionRow,
  persistSessionMessages,
} from "../db/index";
import { pickFolderNative } from "../nativeFolderPicker";

const router = Router();

function isFolderPickerAllowed(req: Request): boolean {
  const raw = req.socket.remoteAddress ?? "";
  return (
    raw === "127.0.0.1" ||
    raw === "::1" ||
    raw === "::ffff:127.0.0.1" ||
    raw.endsWith("127.0.0.1")
  );
}

router.post("/pick-directory", async (req, res) => {
  if (!isFolderPickerAllowed(req)) {
    res.status(403).json({
      error:
        "Folder picker only runs on the machine where the API server is started (localhost).",
    });
    return;
  }
  try {
    const path = await pickFolderNative();
    res.json({ path });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : "Failed to open folder dialog",
    });
  }
});

router.get("/", (_req, res) => {
  const rows = listSessionSummaries();
  res.json({
    sessions: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      preview: r.preview,
    })),
  });
});

router.get("/:id", (req, res) => {
  const id = req.params.id;
  const row = getSessionById(id);
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const history = getMessagesForSession(id);
  res.json({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customTitle: row.title,
    history,
    modelMessages: parseModelMessages(row.model_messages),
    model: row.model,
    sessionDirectory: row.session_directory ?? null,
  });
});

router.post("/", (req, res) => {
  const body = req.body as { model?: unknown };
  const id = crypto.randomUUID();
  const now = Date.now();
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : null;
  createSessionRow(id, now, model);
  res.status(201).json({ id, createdAt: now, updatedAt: now });
});

router.patch("/:id", (req, res) => {
  const id = req.params.id;
  const row = getSessionById(id);
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const body = req.body as {
    customTitle?: unknown;
    model?: unknown;
    modelMessages?: unknown;
    history?: unknown;
    sessionDirectory?: unknown;
  };
  const now = Date.now();

  if (Array.isArray(body.history)) {
    const hist = body.history as WireMessage[];
    const mm =
      "modelMessages" in body
        ? body.modelMessages === null || body.modelMessages === undefined
          ? null
          : Array.isArray(body.modelMessages)
            ? (body.modelMessages as Array<Record<string, unknown>>)
            : parseModelMessages(row.model_messages)
        : parseModelMessages(row.model_messages);
    const chatModel =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : undefined;
    persistSessionMessages(id, hist, mm, now, chatModel);
  }

  const patch: Parameters<typeof patchSessionRow>[1] = { updated_at: now };
  if ("customTitle" in body) {
    const t = body.customTitle;
    patch.title =
      t === null || t === undefined
        ? null
        : typeof t === "string"
          ? t.trim() || null
          : null;
  }
  if (
    "model" in body &&
    body.model !== undefined &&
    !Array.isArray(body.history)
  ) {
    const m = body.model;
    patch.model =
      m === null ? null : typeof m === "string" ? m.trim() || null : null;
  }
  if ("modelMessages" in body && !Array.isArray(body.history)) {
    const mm = body.modelMessages;
    patch.model_messages =
      mm === null || mm === undefined
        ? null
        : Array.isArray(mm)
          ? (mm as Array<Record<string, unknown>>)
          : null;
  }
  if (
    "sessionDirectory" in body &&
    body.sessionDirectory !== undefined &&
    !Array.isArray(body.history)
  ) {
    const d = body.sessionDirectory;
    patch.session_directory =
      d === null || d === undefined
        ? null
        : typeof d === "string"
          ? d.trim() || null
          : null;
  }
  patchSessionRow(id, patch);
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  const ok = deleteSessionRow(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
