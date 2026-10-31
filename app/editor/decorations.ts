import { safeArea, timelineGuide } from "./layouts";
import { silhouetteCanvas, type ShapeMask } from "./shape";
import { loadImage, uid, type Format, type Sticker } from "./types";

const ORANGE = "#FC5200";

/**
 * The timeline's line + node dots as a transparent sticker, so it moves/exports with the group.
 * Drawn at 2× and placed at scale 0.5 to stay crisp at full-quality export.
 */
export async function timelineLine(
  n: number,
  f: Format,
  o: { zigzag: boolean; horizontal: boolean; hero: boolean },
  dx = 0,
  dy = 0,
): Promise<Sticker> {
  const guide = timelineGuide(n, f.w, f.h, o);
  // With a hero, the line ends at the finale's node (drawn as the big orange dot).
  const nodes = [...guide.nodes, ...(guide.end ? [guide.end] : [])].map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const r = 14;
  const pad = r + 6;
  const x0 = Math.min(...nodes.map((p) => p.x)) - pad;
  const x1 = Math.max(...nodes.map((p) => p.x)) + pad;
  const y0 = Math.min(...nodes.map((p) => p.y)) - pad;
  const y1 = Math.max(...nodes.map((p) => p.y)) + pad;
  const S = 2;

  const c = document.createElement("canvas");
  c.width = Math.ceil((x1 - x0) * S);
  c.height = Math.ceil((y1 - y0) * S);
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S);
  ctx.translate(-x0, -y0);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(nodes[0].x, nodes[0].y);
  ctx.lineTo(nodes[nodes.length - 1].x, nodes[nodes.length - 1].y);
  ctx.stroke();

  nodes.forEach((p, i) => {
    const last = i === nodes.length - 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, last ? r * 1.3 : r, 0, Math.PI * 2);
    ctx.fillStyle = last ? ORANGE : "#fff";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = last ? "#fff" : ORANGE;
    ctx.stroke();
  });

  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/png"));
  const l = await loadImage(blob);
  return { id: uid(), ...l, x: (x0 + x1) / 2, y: (y0 + y1) / 2, scale: 1 / S, rotation: 0, opacity: 1, deco: true };
}

/** Faint silhouette of the shape behind the stickers. */
export async function shapeSilhouette(mask: ShapeMask, f: Format, dx = 0, dy = 0): Promise<Sticker> {
  const { canvas, x, y, scale } = silhouetteCanvas(mask, safeArea(f.w, f.h));
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/png"));
  const l = await loadImage(blob);
  return { id: uid(), ...l, x: x + dx, y: y + dy, scale, rotation: 0, opacity: 1, deco: true };
}
