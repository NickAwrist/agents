export type ImageWorkflowParams = {
  prompt: string;
  checkpointName: string;
  width: number;
  height: number;
  seed?: number;
  steps?: number;
  cfg?: number;
};

export function buildImageWorkflow(params: ImageWorkflowParams): Record<string, unknown> {
  const seed = params.seed ?? Math.floor(Math.random() * 2147483647);
  const steps = params.steps ?? 20;
  const cfg = params.cfg ?? 7;

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: params.checkpointName,
      },
    },
    "2": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: params.width,
        height: params.height,
        batch_size: 1,
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: params.prompt,
        clip: ["1", 1],
      },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["1", 1],
      },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["1", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["2", 0],
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["5", 0],
        vae: ["1", 2],
      },
    },
    "7": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "agents",
        images: ["6", 0],
      },
    },
  };
}
