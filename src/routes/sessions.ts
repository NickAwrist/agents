import { Router } from "express";
import crypto from "crypto";
import {
  createSessionRow,
  deleteSessionRow,
  getAgentByName,
  getMessagesForSession,
  getSessionById,
  listSessionSummaries,
  parseModelMessages,
  patchSessionRow,
  replaceSessionMessages,
  resolveSessionAgentName,
  type WireMessage,
} from "../db/index";

const router = Router();

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
    agentName: resolveSessionAgentName(row),
  });
});

router.post("/", (req, res) => {
  const body = req.body as { model?: unknown; agentName?: unknown };
  const id = crypto.randomUUID();
  const now = Date.now();
  const model =
    typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
  const rawAgent =
    typeof body.agentName === "string" && body.agentName.trim() ? body.agentName.trim() : null;
  const agentName =
    rawAgent && getAgentByName(rawAgent) ? rawAgent : null;
  createSessionRow(id, now, model, agentName);
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
    agentName?: unknown;
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
      typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
    replaceSessionMessages(id, hist, mm, now, chatModel);
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
  if ("model" in body && body.model !== undefined && !Array.isArray(body.history)) {
    const m = body.model;
    patch.model = m === null ? null : typeof m === "string" ? m.trim() || null : null;
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
  if ("agentName" in body && body.agentName !== undefined && !Array.isArray(body.history)) {
    const a = body.agentName;
    if (a === null) {
      patch.agent_name = null;
    } else if (typeof a === "string" && a.trim()) {
      const t = a.trim();
      if (!getAgentByName(t)) {
        res.status(400).json({ error: "Unknown agent" });
        return;
      }
      patch.agent_name = t;
    }
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
