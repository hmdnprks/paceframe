import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import type { Background } from "./types";

// Same version as the npm package (the JS and wasm must match). Loaded only when the preset is used.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
// Selfie segmenter (~250 KB): person vs background. In testing it found full-body runners cleanly,
// where DeepLab mislabeled them (e.g. as "bottle") and was 11× bigger.
const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";

/** Where the person is in a photo: a low-res mask over the whole image (1 = person, plus a margin). */
export type SubjectMask = { src: string; w: number; h: number; data: Uint8Array; area: number };

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

/** Find the person in a photo, on-device. Null when nobody is found. */
export async function detectSubject(bg: Background): Promise<SubjectMask | null> {
  const seg = await getSegmenter();
  const f = 512 / Math.max(bg.nw, bg.nh);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bg.nw * f));
  c.height = Math.max(1, Math.round(bg.nh * f));
  c.getContext("2d")!.drawImage(bg.img, 0, 0, c.width, c.height);

  const result = seg.segment(c);
  const mask = result.confidenceMasks?.[0];
  if (!mask) return null;
  const conf = mask.getAsFloat32Array();
  const { width: w, height: h } = mask;
  const data = new Uint8Array(w * h);
  let area = 0;
  for (let i = 0; i < conf.length; i++) {
    if (conf[i] <= 0.5) continue;
    data[i] = 1;
    area++;
  }
  result.close();
  // Nobody found, or "the person" is most of the photo (unreliable, e.g. heavily edited images).
  if (area < w * h * 0.01 || area > w * h * 0.65) return null;
  return { src: bg.src, w, h, data: dilate(data, w, h, Math.round(Math.max(w, h) * 0.02)), area };
}

/** Grow the mask by `r` pixels (square), so stickers keep a little distance from the person. */
function dilate(src: Uint8Array, w: number, h: number, r: number) {
  // Separable max filter: rows, then columns.
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w) v = src[y * w + xx];
      }
      tmp[y * w + x] = v;
    }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h) v = tmp[yy * w + x];
      }
      out[y * w + x] = v;
    }
  return out;
}

/** "Is this canvas point on the person?" for the photo's current position and zoom. */
export function subjectTest(mask: SubjectMask, bg: Background) {
  const left = bg.x - (bg.nw * bg.scale) / 2;
  const top = bg.y - (bg.nh * bg.scale) / 2;
  return (x: number, y: number) => {
    const mx = Math.floor((((x - left) / bg.scale) * mask.w) / bg.nw);
    const my = Math.floor((((y - top) / bg.scale) * mask.h) / bg.nh);
    return mx >= 0 && my >= 0 && mx < mask.w && my < mask.h && mask.data[my * mask.w + mx] === 1;
  };
}
