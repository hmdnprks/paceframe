import { DIVIDER, type Background, type Format, type Rect, type Split, type Sticker } from "./types";

// iOS Safari refuses canvases above ~16.7M pixels.
const MAX_PIXELS = 16_000_000;

/** Highest useful multiplier: enough to keep the photos' native resolution, capped by canvas limits. */
export function maxMultiplier(fmt: Format, bgs: Background[]): number {
  const native = Math.max(1, ...bgs.map((b) => 1 / b.scale));
  const cap = Math.sqrt(MAX_PIXELS / (fmt.w * fmt.h));
  return Math.max(1, Math.min(native, cap, 4));
}

/**
 * Each background is drawn clipped to its pane; a white divider separates split photos.
 * With a cut-out of the person, "behind" stickers go under it and the rest on top.
 */
export async function renderImage(
  fmt: Format,
  backgrounds: { bg: Background; pane: Rect }[],
  split: Split,
  stickers: Sticker[],
  multiplier: number,
  cutout?: { img: HTMLImageElement; bg: Background; pane: Rect } | null,
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

  for (const { bg, pane } of backgrounds) {
    const w = bg.nw * bg.scale;
    const h = bg.nh * bg.scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.x, pane.y, pane.w, pane.h);
    ctx.clip();
    ctx.drawImage(bg.img, bg.x - w / 2, bg.y - h / 2, w, h);
    ctx.restore();
  }

  if (split !== "none") {
    ctx.fillStyle = "#fff";
    if (split === "side") ctx.fillRect(fmt.w / 2 - DIVIDER / 2, 0, DIVIDER, fmt.h);
    else ctx.fillRect(0, fmt.h / 2 - DIVIDER / 2, fmt.w, DIVIDER);
  }

  const drawSticker = (s: Sticker) => {
    const w = s.nw * s.scale;
    const h = s.nh * s.scale;
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.translate(s.x, s.y);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.drawImage(s.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  if (cutout) {
    stickers.filter((s) => s.behind).forEach(drawSticker);
    // The person, exactly over the photo (same position and zoom), clipped to the photo's pane.
    const { bg, pane } = cutout;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.x, pane.y, pane.w, pane.h);
    ctx.clip();
    ctx.drawImage(cutout.img, bg.x - (bg.nw * bg.scale) / 2, bg.y - (bg.nh * bg.scale) / 2, bg.nw * bg.scale, bg.nh * bg.scale);
    ctx.restore();
    stickers.filter((s) => !s.behind).forEach(drawSticker);
  } else {
    stickers.forEach(drawSticker);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"),
  );
}
