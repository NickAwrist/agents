import { Router } from "express";
import { handleChat } from "../chat/chatController";
import { sseManager } from "../chat/sseManager";
import { AbortBodySchema } from "../schemas/chat";

const router = Router();
router.post("/", (req, res) => {
  void handleChat(req, res, sseManager);
});

router.post("/abort", (req, res) => {
  const parsed = AbortBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.json({ aborted: false });
    return;
  }
  const aborted = sseManager.abortRequest(parsed.data.requestId);
  res.json({ aborted });
});

router.get("/active/:sessionId", (req, res) => {
  const gen = sseManager.getActive(req.params.sessionId);
  if (!gen) {
    res.json({ active: false });
    return;
  }
  res.json({ active: true, requestId: gen.requestId });
});

router.get("/stream/:sessionId", (req, res) => {
  const gen = sseManager.getActive(req.params.sessionId);
  if (!gen) {
    res.status(404).json({ error: "No active generation for this session" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  for (const event of gen.eventBuffer) {
    sseManager.sendTo(res, event);
  }

  sseManager.attachClient(gen, res);

  const ping = setInterval(() => {
    res.write(":\n\n");
  }, 15000);

  res.on("close", () => {
    clearInterval(ping);
    if (!res.writableFinished) {
      sseManager.removeClient(gen, res);
    }
  });
});

export default router;
