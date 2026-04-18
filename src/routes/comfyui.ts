import { Readable } from "node:stream";
import { Router } from "express";
import {
  ComfyUIClient,
  getComfyUIClient,
  invalidateComfyUIClient,
} from "../comfyui/client";
import {
  getComfyUIDefaultModel,
  getComfyUIHost,
  getComfyUIImageSize,
  getComfyUINegativePrompt,
  setComfyUIDefaultModel,
  setComfyUIHost,
  setComfyUIImageSize,
  setComfyUINegativePrompt,
} from "../db/index";
import { logger } from "../logger";

const router = Router();
const log = logger.child({ route: "comfyui" });

router.get("/health", async (_req, res) => {
  try {
    const client = getComfyUIClient();
    const result = await client.healthCheck();
    res.json({ connected: result.ok, error: result.error });
  } catch (e) {
    log.error({ err: e }, "comfyui health");
    res.json({
      connected: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.get("/config", (_req, res) => {
  const { width, height } = getComfyUIImageSize();
  res.json({
    host: getComfyUIHost(),
    defaultModel: getComfyUIDefaultModel(),
    defaultWidth: width,
    defaultHeight: height,
    negativePrompt: getComfyUINegativePrompt(),
  });
});

router.put("/config", (req, res) => {
  const body = req.body as {
    host?: unknown;
    defaultModel?: unknown;
    defaultWidth?: unknown;
    defaultHeight?: unknown;
    negativePrompt?: unknown;
  };
  if (typeof body.host === "string") {
    setComfyUIHost(body.host);
    invalidateComfyUIClient();
  }
  if (typeof body.defaultModel === "string") {
    setComfyUIDefaultModel(body.defaultModel);
  }
  if (
    typeof body.defaultWidth === "number" &&
    typeof body.defaultHeight === "number"
  ) {
    setComfyUIImageSize(body.defaultWidth, body.defaultHeight);
  }
  if (typeof body.negativePrompt === "string") {
    setComfyUINegativePrompt(body.negativePrompt);
  }
  const { width, height } = getComfyUIImageSize();
  res.json({
    host: getComfyUIHost(),
    defaultModel: getComfyUIDefaultModel(),
    defaultWidth: width,
    defaultHeight: height,
    negativePrompt: getComfyUINegativePrompt(),
  });
});

router.post("/test", async (req, res) => {
  const body = req.body as { host?: unknown };
  const raw = typeof body.host === "string" ? body.host.trim() : "";
  const url = raw || "http://127.0.0.1:8188";
  const client = new ComfyUIClient(url);
  const result = await client.healthCheck();
  res.json({ ok: result.ok, error: result.error });
});

router.get("/models", async (_req, res) => {
  try {
    const client = getComfyUIClient();
    const models = await client.getModels();
    res.json({ models });
  } catch (e) {
    log.error({ err: e }, "comfyui models");
    res.json({ models: [], error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/view/:filename", async (req, res) => {
  const { filename } = req.params;
  const subfolder =
    typeof req.query.subfolder === "string" ? req.query.subfolder : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : "output";

  try {
    const client = getComfyUIClient();
    const upstream = await client.fetchViewAsset(filename, subfolder, type);
    if (!upstream.ok) {
      res
        .status(upstream.status)
        .json({ error: `ComfyUI returned ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    if (upstream.body) {
      Readable.fromWeb(
        upstream.body as unknown as import("node:stream/web").ReadableStream,
      ).pipe(res);
    } else {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    }
  } catch (e) {
    log.error({ err: e }, "comfyui view proxy");
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
