import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { loadImage, type Background } from "./types";

// Same version as the npm package (the JS and wasm must match). Loaded only when first used.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
// Selfie segmenter (~250 KB): person vs background. In testing it found full-body runners cleanly,
// where DeepLab mislabeled them (e.g. as "bottle") and was 11× bigger.
const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";

// Largest cut-out we make: enough for full-quality export, within iOS canvas limits.
const MAX_CUTOUT_PIXELS = 12_000_000;

let segmenter: Promise<ImageSegmenter> | null = null;

function getSegmenter() {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(WASM);
    return ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  })();
  // Let a failed download be retried later.
  segmenter.catch(() => (segmenter = null));
  return segmenter;
}

/** The person cut out of a photo: same size as the photo, transparent everywhere else. */
export type Cutout = { forSrc: string; src: string; img: HTMLImageElement; nw: number; nh: number };

/**
 * Cut the person out of the photo, on-device. Edges come from the model's confidence, so they blend
 * softly instead of looking jagged. Null when no clear person is found.
 */
export async function cutOutSubject(bg: Background): Promise<Cutout | null> {
  const seg = await getSegmenter();
  const f = 512 / Math.max(bg.nw, bg.nh);
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(bg.nw * f));
  small.height = Math.max(1, Math.round(bg.nh * f));
  small.getContext("2d")!.drawImage(bg.img, 0, 0, small.width, small.height);

  const result = seg.segment(small);
  const mask = result.confidenceMasks?.[0];
  if (!mask) return null;
  const conf = mask.getAsFloat32Array();
  const { width: w, height: h } = mask;

  // Confidence → alpha, slightly sharpened (0.35–0.65 ramps from clear to solid).
  const alpha = document.createElement("canvas");
  alpha.width = w;
  alpha.height = h;
  const actx = alpha.getContext("2d")!;
  const px = actx.createImageData(w, h);
  let area = 0;
  for (let i = 0; i < conf.length; i++) {
    const a = Math.max(0, Math.min(1, (conf[i] - 0.35) / 0.3));
    if (a > 0.5) area++;
    px.data[i * 4 + 3] = Math.round(a * 255);
  }
  actx.putImageData(px, 0, 0);
  result.close();
  // Nobody found, or "the person" is most of the photo (unreliable, e.g. heavily edited images).
  if (area < w * h * 0.01 || area > w * h * 0.65) return null;

  // Full-resolution photo, keeping only the person (the small mask is scaled up smoothly).
  const k = Math.min(1, Math.sqrt(MAX_CUTOUT_PIXELS / (bg.nw * bg.nh)));
  const out = document.createElement("canvas");
  out.width = Math.round(bg.nw * k);
  out.height = Math.round(bg.nh * k);
  const ctx = out.getContext("2d")!;
  ctx.drawImage(bg.img, 0, 0, out.width, out.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(alpha, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("cut-out failed"))), "image/png"));
  return { forSrc: bg.src, ...(await loadImage(blob)) };
}
