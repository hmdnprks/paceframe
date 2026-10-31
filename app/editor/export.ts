import type { Background, Format, Sticker } from "./types";

// iOS Safari refuses canvases above ~16.7M pixels.
const MAX_PIXELS = 16_000_000;

/** Highest useful multiplier: enough to keep the photo's native resolution, capped by canvas limits. */
export function maxMultiplier(fmt: Format, bg: Background | null): number {
  const native = bg ? 1 / bg.scale : 1;
  const cap = Math.sqrt(MAX_PIXELS / (fmt.w * fmt.h));
  return Math.max(1, Math.min(native, cap, 4));
}

export async function renderImage(
  fmt: Format,
  bg: Background | null,
  stickers: Sticker[],
  multiplier: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(fmt.w * multiplier);
  canvas.height = Math.round(fmt.h * multiplier);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(canvas.width / fmt.w, canvas.height / fmt.h);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, fmt.w, fmt.h);

  if (bg) {
    const w = bg.nw * bg.scale;
    const h = bg.nh * bg.scale;
    ctx.drawImage(bg.img, bg.x - w / 2, bg.y - h / 2, w, h);
  }

  for (const s of stickers) {
    const w = s.nw * s.scale;
    const h = s.nh * s.scale;
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.translate(s.x, s.y);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.drawImage(s.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"),
  );
}
