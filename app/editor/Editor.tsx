"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { applyLayout, cascade, DEFAULT_BEND, defaultCols, honeyCols, LAYOUTS, MAX_COLS, placeAmong, TUNABLE, type LayoutId, type LayoutOptions } from "./layouts";
import { maxMultiplier, renderImage } from "./export";
import StravaPanel from "./StravaPanel";
import InstallPrompt from "./InstallPrompt";
import { isStandalone } from "./standalone";
import CardOptions, { type CardSettings } from "./CardOptions";
import { recipeHasRoute, recipeHasText, recipeRun, renderFinisherCard, renderRecipe, withRun } from "./stravaStickers";
import TextStyleSheet from "./TextStyleSheet";
import { DEFAULT_TEXT, type TextStyle } from "./textStyle";
import SwapRun from "./SwapRun";
import { detectSubject, subjectTest, type SubjectMask } from "./subject";
import AddRuns from "./AddRuns";
import type { RunSource } from "./StravaPanel";
import type { Activity } from "@/app/lib/activity";
import RouteColor from "./RouteColor";
import { DEFAULT_STYLE, paintFor, recolorPixels, toHex, type RouteStyle } from "./routeStyle";
import { pathLine, shapeSilhouette, timelineLine } from "./decorations";
import { extractMask } from "./shape";
import {
  ArrowDown,
  ArrowRight,
  BringToFront,
  Check,
  ChevronDown,
  ChevronRight,
  Contrast,
  Copy,
  Crosshair,
  Download,
  Footprints,
  Group,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  Maximize2,
  Minus,
  Move,
  Palette,
  PersonStanding,
  Star,
  RefreshCw,
  Replace,
  PencilLine,
  Plus,
  RotateCcw,
  Shapes,
  SendToBack,
  SlidersHorizontal,
  Trash2,
  Type,
  Ungroup,
  X,
  type LucideIcon,
} from "lucide-react";
import { DIVIDER, FORMATS, loadImage, panes, uid, type Background, type Format, type Rect, type Split, type Sticker, type Transform } from "./types";

/** "bg" / "bg2" = the first / second background photo; anything else is a sticker id (or the group). */
type Target = "bg" | "bg2" | string;
const isBg = (t: Target | null) => t === "bg" || t === "bg2";
type Pt = { x: number; y: number };
type Sheet = null | "layout" | "tune" | "export" | "format" | "strava" | "edit" | "photo" | "color" | "swap" | "text" | "addRuns";

const SNAP_PX = 10;
const GROUP = "__group";

type Placed = Transform & { nw: number; nh: number };

/** Axis-aligned bounds of rotated stickers, in design units. */
function bounds(items: Placed[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of items) {
    const r = (s.rotation * Math.PI) / 180;
    const c = Math.abs(Math.cos(r));
    const n = Math.abs(Math.sin(r));
    const hw = (s.nw * s.scale) / 2;
    const hh = (s.nh * s.scale) / 2;
    const ex = hw * c + hh * n;
    const ey = hw * n + hh * c;
    x0 = Math.min(x0, s.x - ex);
    y0 = Math.min(y0, s.y - ey);
    x1 = Math.max(x1, s.x + ex);
    y1 = Math.max(y1, s.y + ey);
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Move/scale/rotate every member as one rigid group: `from` → `to` around the group center. */
function groupMove(members: Record<string, Transform>, from: Transform, to: Transform) {
  const ratio = to.scale / from.scale;
  const dr = to.rotation - from.rotation;
  const cos = Math.cos((dr * Math.PI) / 180);
  const sin = Math.sin((dr * Math.PI) / 180);
  const out: Record<string, Transform> = {};
  for (const [id, m] of Object.entries(members)) {
    const ox = (m.x - from.x) * ratio;
    const oy = (m.y - from.y) * ratio;
    out[id] = { x: to.x + ox * cos - oy * sin, y: to.y + ox * sin + oy * cos, scale: m.scale * ratio, rotation: m.rotation + dr };
  }
  return out;
}

/** Snap to the nearest right angle when within a few degrees. */
function snapAngle(deg: number) {
  const near = Math.round(deg / 90) * 90;
  return Math.abs(deg - near) < 4 ? near : deg;
}

export default function Editor() {
  const [format, setFormat] = useState<Format>(FORMATS[0]);
  const [bg, setBg] = useState<Background | null>(null);
  // Second photo when the background is split (right half, or bottom half).
  const [bg2, setBg2] = useState<Background | null>(null);
  const [split, setSplitState] = useState<Split>("none");
  // Locked photos never move, even with nothing selected.
  const [photoLocked, setPhotoLocked] = useState(false);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [busy, setBusy] = useState(false);

  // Fit the stage into the space between the top and bottom bars.
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dispW = Math.min(box.w, (box.h * format.w) / format.h);
  const k = dispW / format.w; // screen px per design unit

  // Latest state for gesture handlers.
  const live = useRef({ bg, bg2, split, stickers, format, k, groupIds: [] as string[], selected: null as string | null, photoLocked: false });

  // Coming back from Strava OAuth (?strava=connected or ?strava_error=…): reopen the Strava sheet.
  const [stravaError, setStravaError] = useState<string | null>(null);
  // Login code to carry over to the installed app when iOS finished the Strava login in Safari.
  const [handoff, setHandoff] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("strava") && !q.has("strava_error")) return;
    window.history.replaceState(null, "", window.location.pathname);
    const code = q.get("handoff");
    queueMicrotask(() => {
      setStravaError(q.get("strava_error"));
      // Inside the installed app the session cookie is already here; only Safari needs the code.
      if (code && !isStandalone()) setHandoff(code);
      else setSheet("strava");
    });
  }, []);

  const photoInput = useRef<HTMLInputElement>(null);
  const stickerInput = useRef<HTMLInputElement>(null);

  /** Fit a photo to cover its pane (the whole canvas, or one half when split). */
  const coverBg = (b: Omit<Background, keyof Transform>, pane: Rect): Background => ({
    ...b,
    x: pane.x + pane.w / 2,
    y: pane.y + pane.h / 2,
    scale: Math.max(pane.w / b.nw, pane.h / b.nh),
    rotation: 0,
  });

  // Which pane the photo picker fills: 0 = single/first, 1 = second.
  const photoSlot = useRef<0 | 1>(0);

  function pickPhoto(slot: 0 | 1) {
    photoSlot.current = slot;
    setSheet(null);
    photoInput.current?.click();
  }

  async function setPhoto(file: File, slot: 0 | 1, sp: Split = split, f: Format = format) {
    const loaded = await loadImage(file);
    const pane = panes(f, sp)[Math.min(slot, panes(f, sp).length - 1)];
    const old = slot === 0 ? live.current.bg : live.current.bg2;
    if (old) URL.revokeObjectURL(old.src);
    const next = coverBg({ id: slot === 0 ? "bg" : "bg2", ...loaded }, pane);
    if (slot === 0) setBg(next);
    else setBg2(next);
  }

  async function onPhoto(files: FileList | null) {
    const file = files?.[0];
    if (file) await setPhoto(file, photoSlot.current);
  }

  /** Switch between one photo and a two-photo split; photos re-fit their new panes. */
  function setSplit(next: Split, f: Format = format) {
    const [p0, p1] = panes(f, next);
    setBg((b) => (b ? coverBg(b, p0) : b));
    if (next === "none") {
      if (live.current.bg2) URL.revokeObjectURL(live.current.bg2.src);
      setBg2(null);
    } else setBg2((b) => (b ? coverBg(b, p1) : b));
    setSplitState(next);
  }

  async function onStickers(files: FileList | null) {
    if (!files?.length) return;
    addLayers(await Promise.all([...files].map(loadImage)));
  }

  // Date range the current Strava batch came from; "Add runs" only offers runs from it.
  const [groupSource, setGroupSource] = useState<RunSource | null>(null);
  // Action waiting for the user's OK (group / ungroup).
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: string; run: () => void } | null>(null);

  // Suggested grid columns for the last batch (e.g. one row per Strava activity).
  const [hintCols, setHintCols] = useState<number | null>(null);

  function addLayers(
    loaded: Awaited<ReturnType<typeof loadImage>>[],
    perRow?: number,
    autoLayout?: LayoutId,
    layoutPatch: Partial<LayoutOptions> = {},
    source?: RunSource,
  ) {
    setHintCols(perRow ?? null);
    if (source) setGroupSource(source);
    setSheet(null);
    const placed = cascade(loaded, format.w, format.h, stickers.length);
    const added: Sticker[] = loaded.map((l, i) => ({ id: uid(), ...l, ...placed[i], opacity: 1 }));
    if (autoLayout) {
      const all = [...stickers, ...added];
      // Long timelines (e.g. a 19-week block) need both sides of the line to stay readable.
      const o =
        autoLayout === "timeline" ? { ...opts, zigzag: all.length > 8, horizontal: false, hero: false, ...layoutPatch } : { ...opts, ...layoutPatch };
      setOpts(o);
      return arrange(autoLayout, o, false, all);
    }
    setStickers((s) => [...s, ...added]);
    setSelected(added.length === 1 ? added[0].id : null);
    // Ask how to arrange when several come in at once.
    if (stickers.length + added.length > 1) setSheet("layout");
  }

  /** Then vs Now from Strava: split the background, load both photos, place THEN / NOW / badge. */
  async function addThenNow(layers: Awaited<ReturnType<typeof loadImage>>[], sp: Split, photos: (File | null)[]) {
    setSplit(sp);
    await Promise.all(photos.map((f, i) => f && setPhoto(f, i === 0 ? 0 : 1, sp)));
    addLayers(layers, undefined, "versus", { split: sp });
  }

  function changeFormat(f: Format) {
    setSplit(split, f);
    setFormat(f);
    setSheet(null);
    // A laid-out group is re-laid out for the new size; squeezing positions alone makes stickers overlap.
    if (grouped) return arrange(layout, opts, false, stickers, f, false);
    const sx = f.w / format.w;
    const sy = f.h / format.h;
    setStickers((s) => s.map((st) => ({ ...st, x: st.x * sx, y: st.y * sy })));
  }

  // Last applied layout and its tunable options (columns, arc bend, tilt).
  const [layout, setLayout] = useState<LayoutId>("grid");
  const [opts, setOpts] = useState<Required<Omit<LayoutOptions, "rand" | "avoid" | "heroIndex">>>({
    cols: 2,
    bend: DEFAULT_BEND,
    tilt: true,
    zigzag: false,
    horizontal: false,
    hero: false,
    split: "side",
    weights: [],
    bySize: false,
    path: true,
    mask: null,
    shapeMode: "fill",
    silhouette: false,
    angle: 30,
    spacing: 0.12,
    avoidSubject: true,
    heroCenter: false,
    heroSize: 0.45,
  });
  // Stickers that move together. Picking a layout groups everything it arranged.
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const groupMembers = stickers.filter((s) => groupIds.includes(s.id));
  const grouped = groupMembers.length > 1;
  live.current = { bg, bg2, split, stickers, format, k, groupIds, selected, photoLocked };

  // ---- Wrap around subject ----
  const [subject, setSubject] = useState<SubjectMask | null>(null);
  const [detecting, setDetecting] = useState(false);
  // Refs too: arranging right after setting these must see the new values, not the previous render's.
  const subjectRef = useRef<SubjectMask | null>(null);
  const heroRef = useRef<string | null>(null);

  async function pickWrap() {
    if (!bg) return setToast("Add a photo first: the stickers wrap around the person in it.");
    if (stickers.filter((s) => !s.deco).length < 2) return setToast("Add a few stickers first.");
    let mask = subject?.src === bg.src ? subject : null;
    if (!mask) {
      setDetecting(true);
      setToast("Finding the person in your photo… (first time downloads the detector, about 14 MB)");
      try {
        mask = await detectSubject(bg);
      } catch {
        setToast("Couldn't load the person detector. Check your connection and try again.");
        return;
      } finally {
        setDetecting(false);
      }
      subjectRef.current = mask;
      setSubject(mask);
      if (!mask) setToast("Couldn't find a clear person, so stickers fill the whole photo. You can still set a hero.");
      else setToast(null);
    }
    const o = { ...opts, avoidSubject: !!mask };
    setOpts(o);
    arrange("wrap", o);
  }

  function makeHero(id: string) {
    heroRef.current = id;
    const o = { ...opts, heroCenter: true };
    setOpts(o);
    arrange("wrap", o, true);
  }

  // Ignores stale async decorations when the layout changes quickly (e.g. tapping through options).
  const decoRun = useRef(0);

  function arrange(id: LayoutId, o = opts, keepCenter = false, base = stickers, f = format, openTune = true) {
    // Layout decorations (timeline line) are rebuilt for every arrangement.
    base.filter((s) => s.deco).forEach((s) => URL.revokeObjectURL(s.src));
    const items = base.filter((s) => !s.deco);
    const extra: Partial<LayoutOptions> = {};
    if (id === "wrap") {
      // Keep clear of the person, for the photo's current position and zoom.
      const mask = subjectRef.current;
      if (o.avoidSubject && mask && bg && mask.src === bg.src) extra.avoid = subjectTest(mask, bg);
      if (o.heroCenter) {
        const chosen = items.findIndex((s) => s.id === heroRef.current);
        // Default hero: the longest run, else the first sticker.
        const longest = items.reduce((best, s, i) => ((s.weight ?? 0) > (items[best]?.weight ?? 0) ? i : best), 0);
        extra.heroIndex = chosen >= 0 ? chosen : longest;
      }
    }
    const t = applyLayout(id, items, f.w, f.h, { ...o, ...extra, weights: items.map((s) => s.weight ?? 0) });
    let next = items.map((st, i) => ({ ...st, ...t[i] }));
    let dx = 0;
    let dy = 0;
    const members = groupMembers.filter((s) => !s.deco);
    if (keepCenter && members.length > 1) {
      // Re-layout in place instead of snapping back to the middle.
      const was = bounds(members);
      const now = bounds(next);
      dx = was.cx - now.cx;
      dy = was.cy - now.cy;
      next = next.map((st) => ({ ...st, x: st.x + dx, y: st.y + dy }));
    }
    setStickers(next);
    setGroupIds(next.map((st) => st.id));
    setSelected(GROUP);
    setLayout(id);
    if (openTune) setSheet(TUNABLE.includes(id) ? "tune" : null);

    const run = ++decoRun.current;
    const deco =
      id === "timeline" && next.length > 1
        ? timelineLine(next.length, f, o, dx, dy)
        : id === "shape" && o.mask && o.silhouette
          ? shapeSilhouette(o.mask, f, dx, dy)
          : id === "spiral" && o.path && next.length > 2
            ? pathLine(next.map((s) => ({ x: s.x, y: s.y })))
            : null;
    deco?.then((d) => {
      if (run !== decoRun.current) return URL.revokeObjectURL(d.src);
      setStickers((s) => [d, ...s.filter((x) => !x.deco)]);
      setGroupIds((ids) => [...ids, d.id]);
    });
  }

  // ---- Shape from image ----
  const shapeInput = useRef<HTMLInputElement>(null);
  const [shapeImg, setShapeImg] = useState<HTMLImageElement | null>(null);
  const [invertShape, setInvertShape] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function applyShape(img: HTMLImageElement, invert: boolean, patch: Partial<typeof opts> = {}) {
    const mask = extractMask(img, invert);
    if (!mask) {
      setToast("Couldn't find a clear shape. Try a logo or silhouette on a plain background, or tap Invert.");
      return false;
    }
    const o = { ...opts, ...patch, mask };
    setOpts(o);
    arrange("shape", o, layout === "shape");
    return true;
  }

  async function onShapeFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const { img, src } = await loadImage(file);
    // The mask is all we need; the image only stays around for Invert.
    URL.revokeObjectURL(src);
    if (applyShape(img, false, { shapeMode: "fill" })) {
      setShapeImg(img);
      setInvertShape(false);
    }
  }

  function toggleInvert() {
    if (!shapeImg) return;
    if (applyShape(shapeImg, !invertShape)) setInvertShape(!invertShape);
  }

  function pickLayout(id: LayoutId) {
    if (!TUNABLE.includes(id) || id === "timeline") return arrange(id);
    const n = stickers.filter((s) => !s.deco).length;
    const items = stickers.filter((s) => !s.deco);
    const cols = id === "honeycomb" ? honeyCols(n, format.w, format.h) : (hintCols ?? (id === "arc" ? 5 : defaultCols(n)));
    // Spiral sizes by distance when the stickers carry one (Strava routes).
    const o = { ...opts, cols: Math.min(cols, n, MAX_COLS), bySize: id === "spiral" ? items.some((s) => s.weight) : opts.bySize };
    setOpts(o);
    arrange(id, o);
  }

  function tune(patch: Partial<typeof opts>) {
    const o = { ...opts, ...patch };
    o.cols = Math.max(1, Math.min(o.cols, MAX_COLS, stickers.length));
    setOpts(o);
    arrange(layout, o, true);
  }

  function groupAll() {
    setGroupIds(stickers.map((s) => s.id));
    setSelected(GROUP);
  }

  function ungroup() {
    setGroupIds([]);
    setSelected(null);
  }

  function centerGroup() {
    const b = bounds(groupMembers);
    const dx = format.w / 2 - b.cx;
    const dy = format.h / 2 - b.cy;
    setStickers((s) => s.map((st) => (groupIds.includes(st.id) ? { ...st, x: st.x + dx, y: st.y + dy } : st)));
  }

  const update = useCallback((target: Target, t: Partial<Transform>) => {
    if (target === "bg") setBg((b) => (b ? { ...b, ...t } : b));
    else if (target === "bg2") setBg2((b) => (b ? { ...b, ...t } : b));
    else setStickers((s) => s.map((st) => (st.id === target ? { ...st, ...t } : st)));
  }, []);

  // ---- Gestures: 1 finger drags, 2 fingers pinch-zoom + rotate (stickers & groups) ----
  type Start = { pts: Pt[]; t: Transform; members?: Record<string, Transform> };
  const g = useRef<{
    target: Target | null;
    pointers: Map<number, Pt>;
    start: Start | null;
    moved: boolean;
    /** Sticker under the first finger (for double-tap inside a group). */
    tapId: string | null;
    /** Touch started on empty space (not a sticker or the group box): a tap there deselects. */
    onEmpty: boolean;
    lastTap: { id: string; t: number } | null;
  }>({ target: null, pointers: new Map(), start: null, moved: false, tapId: null, lastTap: null, onEmpty: false });

  const toDesign = (p: Pt): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (p.x - r.left) / live.current.k, y: (p.y - r.top) / live.current.k };
  };

  const liveGroup = () => live.current.stickers.filter((s) => live.current.groupIds.includes(s.id));

  /** Current transform of a target. A group is represented by its bounding-box center at scale 1, rotation 0. */
  const current = (target: Target): Transform | null => {
    const { bg, bg2, stickers } = live.current;
    if (target === "bg") return bg;
    if (target === "bg2") return bg2;
    if (target === GROUP) {
      const m = liveGroup();
      if (!m.length) return null;
      const b = bounds(m);
      return { x: b.cx, y: b.cy, scale: 1, rotation: 0 };
    }
    return stickers.find((s) => s.id === target) ?? null;
  };

  const snapshot = (target: Target, pts: Pt[]): Start | null => {
    const t = current(target);
    if (!t) return null;
    const start: Start = { pts, t: { x: t.x, y: t.y, scale: t.scale, rotation: t.rotation } };
    if (target === GROUP) {
      start.members = Object.fromEntries(
        liveGroup().map((s) => [s.id, { x: s.x, y: s.y, scale: s.scale, rotation: s.rotation }]),
      );
    }
    return start;
  };

  /** Apply a new transform, relative to the gesture's starting snapshot for groups. */
  const setTarget = (target: Target, next: Transform, start: Start) => {
    if (target !== GROUP) return update(target, next);
    const moved = groupMove(start.members ?? {}, start.t, next);
    setStickers((s) => s.map((st) => (moved[st.id] ? { ...st, ...moved[st.id] } : st)));
  };

  const restart = () => {
    const { target, pointers } = g.current;
    g.current.start = target ? snapshot(target, [...pointers.values()].map(toDesign)) : null;
  };

  /** Topmost sticker under a screen point (stickers sit under the group box, so hit-test by position). */
  const stickerAt = (p: Pt): string | null => {
    const d = toDesign(p);
    const list = live.current.stickers;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.deco) continue;
      // Undo the sticker's rotation, then test against its box.
      const r = (-s.rotation * Math.PI) / 180;
      const dx = d.x - s.x;
      const dy = d.y - s.y;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= (s.nw * s.scale) / 2 && Math.abs(ly) <= (s.nh * s.scale) / 2) return s.id;
    }
    return null;
  };

  /** The background photo under a screen point (the touched half when split). */
  const bgAt = (p: Pt): Target | null => {
    const { bg, bg2, split, format } = live.current;
    if (split !== "none" && bg2) {
      const d = toDesign(p);
      const second = panes(format, split)[1];
      if (d.x >= second.x && d.y >= second.y) return "bg2";
    }
    return bg ? "bg" : null;
  };

  function onPointerDown(e: React.PointerEvent) {
    if (picking) {
      const hex = sampleAt({ x: e.clientX, y: e.clientY });
      setPicking(false);
      if (!hex) setToast("Tap on the photo to pick a color.");
      else if (pickFor.current === "text") setTextStyle((t) => ({ ...t, color: hex }));
      else setRouteColors((st) => ({ ...st, colors: st.colors.map((c, i) => (i === Math.min(colorSlot, st.colors.length - 1) ? hex : c)) }));
      setSheet(pickFor.current === "text" ? "text" : "color");
      return;
    }
    const el = e.target as HTMLElement;
    if (el.closest("[data-handle]")) return;
    stageRef.current!.setPointerCapture(e.pointerId);
    if (g.current.pointers.size === 0) {
      const id = el.closest<HTMLElement>("[data-sticker]")?.dataset.sticker;
      // A group member picked by double-tap moves on its own; otherwise touching a member moves the group.
      const solo = id && live.current.selected === id;
      const inGroup = !solo && (el.closest("[data-group]") || (id && live.current.groupIds.includes(id) && liveGroup().length > 1));
      g.current.tapId = id ?? stickerAt({ x: e.clientX, y: e.clientY });
      g.current.onEmpty = !id && !inGroup;
      // With a selection, touches on empty space keep editing it (easier to pinch small stickers), so the
      // photo can't move by accident. The photo only moves when nothing is selected and it isn't locked.
      const current = live.current.selected;
      g.current.target = inGroup
        ? GROUP
        : (id ??
          (current && (current !== GROUP || liveGroup().length > 1)
            ? current
            : live.current.photoLocked
              ? null
              : bgAt({ x: e.clientX, y: e.clientY })));
      g.current.moved = false;
      if (inGroup) setSelected(GROUP);
      else if (id) setSelected(id);
    }
    g.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    restart();
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = g.current;
    if (!st.pointers.has(e.pointerId) || !st.start || !st.target) return;
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...st.pointers.values()].map(toDesign);
    const { start, target } = st;
    const { format, k } = live.current;

    if (pts.length === 1) {
      const dx = pts[0].x - start.pts[0].x;
      const dy = pts[0].y - start.pts[0].y;
      if (Math.hypot(dx, dy) * k > 4) st.moved = true;
      let x = start.t.x + dx;
      let y = start.t.y + dy;
      const snap = SNAP_PX / k;
      const v = Math.abs(x - format.w / 2) < snap;
      const h = Math.abs(y - format.h / 2) < snap;
      if (v) x = format.w / 2;
      if (h) y = format.h / 2;
      setGuides({ v, h });
      setTarget(target, { ...start.t, x, y }, start);
      return;
    }

    st.moved = true;
    setGuides({ v: false, h: false });
    const [a0, b0] = start.pts;
    const [a1, b1] = pts;
    const ratio = Math.hypot(b1.x - a1.x, b1.y - a1.y) / Math.max(1, Math.hypot(b0.x - a0.x, b0.y - a0.y));
    const rot = isBg(target) ? 0 : Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
    const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    // Keep the point under the fingers fixed while scaling/rotating.
    const ox = (start.t.x - m0.x) * ratio;
    const oy = (start.t.y - m0.y) * ratio;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    setTarget(
      target,
      {
        x: m1.x + ox * cos - oy * sin,
        y: m1.y + ox * sin + oy * cos,
        scale: Math.max(0.02, start.t.scale * ratio),
        rotation: snapAngle(start.t.rotation + (rot * 180) / Math.PI),
      },
      start,
    );
  }

  function onPointerUp(e: React.PointerEvent) {
    const st = g.current;
    if (!st.pointers.delete(e.pointerId)) return;
    if (st.pointers.size === 0) {
      // A tap on empty space clears the selection.
      if (!st.moved && (st.onEmpty || isBg(st.target) || st.target === null)) setSelected(null);
      // Double-tap a sticker inside a group: select just that one.
      if (!st.moved && st.tapId && live.current.groupIds.includes(st.tapId)) {
        const now = Date.now();
        if (st.lastTap?.id === st.tapId && now - st.lastTap.t < 400) {
          setSelected(st.tapId);
          st.lastTap = null;
        } else st.lastTap = { id: st.tapId, t: now };
      }
      st.target = null;
      st.start = null;
      setGuides({ v: false, h: false });
    } else {
      restart();
    }
  }

  // Desktop: wheel zooms the selection (or the photo).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const target = selected ?? (live.current.bg && !live.current.photoLocked ? "bg" : null);
      const start = target && snapshot(target, []);
      if (!target || !start) return;
      setTarget(target, { ...start.t, scale: Math.max(0.02, start.t.scale * Math.exp(-e.deltaY * 0.0015)) }, start);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // One-finger resize/rotate handle on the selected sticker or group.
  function onHandleDown(e: React.PointerEvent, target: Target) {
    e.stopPropagation();
    const start = snapshot(target, []);
    if (!start) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const c = start.t;
    const p0 = toDesign({ x: e.clientX, y: e.clientY });
    const d0 = Math.hypot(p0.x - c.x, p0.y - c.y);
    const a0 = Math.atan2(p0.y - c.y, p0.x - c.x);
    const move = (ev: PointerEvent) => {
      const p = toDesign({ x: ev.clientX, y: ev.clientY });
      const rotation = snapAngle(c.rotation + ((Math.atan2(p.y - c.y, p.x - c.x) - a0) * 180) / Math.PI);
      const scale = Math.max(0.02, (c.scale * Math.hypot(p.x - c.x, p.y - c.y)) / Math.max(1, d0));
      setTarget(target, { ...c, scale, rotation }, start);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  // ---- Sticker actions ----
  const sel = stickers.find((s) => s.id === selected) ?? null;

  // ---- Route colors ----
  const [routeColors, setRouteColors] = useState<RouteStyle>(DEFAULT_STYLE);
  const [colorSlot, setColorSlot] = useState(0);
  const [picking, setPicking] = useState(false);
  const [recoloring, setRecoloring] = useState(false);
  const COLORS_KEY = "paceframe:route-colors";
  // Remembered per device; loaded after mount (the page is prerendered without storage).
  useEffect(() => {
    let saved: RouteStyle | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(COLORS_KEY) ?? "null");
    } catch {}
    if (saved?.colors?.length) queueMicrotask(() => setRouteColors(saved));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(COLORS_KEY, JSON.stringify(routeColors));
    } catch {}
  }, [routeColors]);

  // ---- Text style (size, metrics layout, font, color) ----
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT);
  const [restyling, setRestyling] = useState(false);
  // Which setting the photo eyedropper fills.
  const pickFor = useRef<"route" | "text">("route");
  const TEXT_KEY = "paceframe:text-style";
  useEffect(() => {
    let saved: TextStyle | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(TEXT_KEY) ?? "null");
    } catch {}
    if (saved?.font) queueMicrotask(() => setTextStyle({ ...DEFAULT_TEXT, ...saved }));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TEXT_KEY, JSON.stringify(textStyle));
    } catch {}
  }, [textStyle]);

  const hasText = (s: Sticker) => !s.deco && !!s.recipe && recipeHasText(s.recipe);

  async function applyText(scope: "selected" | "all") {
    const pool = scope === "all" ? stickers : selected === GROUP ? groupMembers : sel ? [sel] : [];
    const targets = pool.filter(hasText);
    if (!targets.length) return setToast("Text style applies to Strava stickers.");
    setRestyling(true);
    try {
      const updated = new Map(
        await Promise.all(targets.map(async (s) => [s.id, await renderRecipe(s.recipe!, s.paint, textStyle)] as const)),
      );
      setStickers((list) =>
        list.map((x) => {
          const layer = updated.get(x.id);
          if (!layer) return x;
          if (!list.some((y) => y.id !== x.id && y.src === x.src)) URL.revokeObjectURL(x.src);
          // Keep on-screen width, so bigger text shows as a relatively smaller route.
          return { ...x, ...layer, scale: (x.scale * x.nw) / layer.nw, text: textStyle };
        }),
      );
      setSheet(null);
    } finally {
      setRestyling(false);
    }
  }

  /** Average color of a small patch of the background photo under a screen point. */
  function sampleAt(p: Pt): string | null {
    const target = bgAt(p);
    const b = target === "bg2" ? bg2 : target === "bg" ? bg : null;
    if (!b) return null;
    const d = toDesign(p);
    const ix = (d.x - (b.x - (b.nw * b.scale) / 2)) / b.scale;
    const iy = (d.y - (b.y - (b.nh * b.scale) / 2)) / b.scale;
    if (ix < 0 || iy < 0 || ix >= b.nw || iy >= b.nh) return null;
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(b.img, Math.max(0, ix - 3), Math.max(0, iy - 3), 7, 7, 0, 0, 1, 1);
    const [r, g, bl] = ctx.getImageData(0, 0, 1, 1).data;
    return toHex(r, g, bl);
  }

  // Stickers a route color can change: Strava stickers with a route, and gallery stickers (their orange pixels).
  const colorable = (s: Sticker) => !s.deco && !s.noRoute && (s.recipe ? recipeHasRoute(s.recipe) : true);

  async function applyColors(scope: "selected" | "all") {
    const pool = scope === "all" ? stickers : selected === GROUP ? groupMembers : sel ? [sel] : [];
    const targets = pool.filter(colorable);
    if (!targets.length) return setToast("No routes to recolor here.");
    setRecoloring(true);
    try {
      const updated = await Promise.all(
        targets.map(async (s, i) => {
          const paint = paintFor(routeColors, i, targets.length);
          if (s.recipe) return { id: s.id, layer: await renderRecipe(s.recipe, paint, s.text), paint, original: undefined };
          const original = s.original ?? { src: s.src, img: s.img, nw: s.nw, nh: s.nh };
          return { id: s.id, layer: await recolorPixels(original.img, paint), paint, original };
        }),
      );
      setStickers((list) => {
        const byId = new Map(updated.map((u) => [u.id, u]));
        const next = list.map((x) => {
          const u = byId.get(x.id);
          if (!u) return x;
          // Keep position, rotation and on-screen width.
          return { ...x, ...u.layer, scale: (x.scale * x.nw) / u.layer.nw, paint: u.paint, original: u.original ?? x.original };
        });
        // Free replaced images nobody uses anymore (never the originals).
        for (const old of list) {
          if (!byId.has(old.id) || old.src === old.original?.src) continue;
          if (!next.some((x) => x.src === old.src || x.original?.src === old.src)) URL.revokeObjectURL(old.src);
        }
        return next;
      });
      setSheet(null);
    } finally {
      setRecoloring(false);
    }
  }

  // ---- Add more runs to a group ----
  // New stickers copy a group member's design (metrics, text style, size); weeks/cards/Then vs Now don't qualify.
  const runTemplate = groupMembers.find((s) => s.recipe && recipeRun(s.recipe) && (s.recipe.kind === "run" || s.recipe.kind === "routeOnly"));
  const [addingRuns, setAddingRuns] = useState(false);

  async function addRunsToGroup(acts: Activity[]) {
    const template = runTemplate;
    if (!template?.recipe || !acts.length) return;
    setAddingRuns(true);
    try {
      const existing = groupMembers.filter((s) => !s.deco);
      const total = existing.length + acts.length;
      const layers = await Promise.all(
        acts.map(async (a, j) => {
          const recipe = withRun(template.recipe!, { ...a, race: false });
          // Continue the route color pattern (multi-color / gradient across runs) after the existing runs.
          const paint = paintFor(routeColors, existing.length + j, total);
          return { ...(await renderRecipe(recipe, paint, template.text)), recipe, paint, text: template.text };
        }),
      );
      const width = template.nw * template.scale; // same on-screen size as the template
      const fresh: Sticker[] = layers.map((l, i) => ({
        id: uid(),
        ...l,
        x: format.w / 2,
        y: format.h / 2,
        scale: width / l.nw,
        rotation: 0,
        opacity: 1,
        weight: template.weight !== undefined ? acts[i].distance : undefined,
      }));
      // Scatter: drop the new runs into free spots and leave the others where they are.
      const spots = layout === "scatter" ? placeAmong(existing, fresh, fresh.map((f) => f.scale), format.w, format.h) : null;
      if (spots) {
        setStickers((list) => [...list, ...fresh.map((f, i) => ({ ...f, ...spots[i] }))]);
        setGroupIds((ids) => [...ids, ...fresh.map((f) => f.id)]);
        setSelected(GROUP);
        setSheet(null);
        return;
      }
      // Other layouts, or a scatter with no room left: lay everything out again with the new runs.
      arrange(layout, opts, true, [...stickers, ...fresh], format, false);
      if (layout !== "scatter") setToast(`Added ${acts.length} run${acts.length > 1 ? "s" : ""} and re-arranged the ${LAYOUTS.find((l) => l.id === layout)?.label ?? ""} layout.`);
      else setToast("No free space left, so the scatter was re-arranged to fit everything.");
      setSheet(null);
    } finally {
      setAddingRuns(false);
    }
  }

  // ---- Swap the run in a Strava sticker ----
  const runOf = (s: Sticker | null) => (s?.recipe ? recipeRun(s.recipe) : null);
  const [swapping, setSwapping] = useState(false);

  async function swapRun(target: Sticker, a: Activity) {
    if (!target.recipe) return;
    setSwapping(true);
    try {
      const res = await fetch(`/api/strava/activities/${a.id}`);
      const detail = res.ok ? ((await res.json()) as { activity: Activity }).activity : a;
      const old = recipeRun(target.recipe);
      const recipe = withRun(target.recipe, { ...detail, race: old?.race ? detail.race : false });
      const layer = await renderRecipe(recipe, target.paint, target.text);
      setStickers((list) => {
        if (!list.some((x) => x.id !== target.id && x.src === target.src)) URL.revokeObjectURL(target.src);
        return list.map((x) =>
          x.id === target.id
            ? {
                ...x,
                ...layer,
                scale: (x.scale * x.nw) / layer.nw,
                recipe,
                edit: recipe.kind === "finisher" ? recipe.source : x.edit,
                weight: x.weight !== undefined ? detail.distance : undefined,
              }
            : x,
        );
      });
      setSheet(null);
    } finally {
      setSwapping(false);
    }
  }

  function removeSticker(id: string) {
    const s = stickers.find((x) => x.id === id);
    const rest = stickers.filter((x) => x.id !== id);
    if (s && !rest.some((x) => x.src === s.src)) URL.revokeObjectURL(s.src);
    if (s?.original && !rest.some((x) => x.original?.src === s.original!.src)) URL.revokeObjectURL(s.original.src);
    setStickers(rest);
    setGroupIds((ids) => ids.filter((x) => x !== id));
    setSelected(groupIds.filter((x) => x !== id && rest.some((r) => r.id === x)).length > 1 ? GROUP : null);
  }

  function reorder(id: string, dir: 1 | -1) {
    setStickers((s) => {
      const i = s.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // ---- Edit a generated sticker (finisher card) in place ----
  // The selected sticker, or the only editable sticker in the selected group.
  const editable =
    sel?.edit
      ? sel
      : selected === GROUP && groupMembers.filter((s) => s.edit).length === 1
        ? groupMembers.find((s) => s.edit)!
        : null;
  const [editDraft, setEditDraft] = useState<CardSettings | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  function openEdit() {
    if (!editable?.edit) return;
    const { time, pr, metrics } = editable.edit;
    setEditDraft({ time, pr, metrics });
    setSheet("edit");
  }

  async function applyEdit() {
    if (!editable?.edit || !editDraft) return;
    setEditBusy(true);
    try {
      const source = { ...editable.edit, ...editDraft };
      const layer = await renderFinisherCard(source.run, source, editable.paint, editable.text);
      const target = editable;
      setStickers((list) => {
        if (!list.some((x) => x.id !== target.id && x.src === target.src)) URL.revokeObjectURL(target.src);
        // Keep position, rotation and on-screen width; height follows the new content.
        return list.map((x) =>
          x.id === target.id
            ? { ...x, ...layer, scale: (x.scale * x.nw) / layer.nw, edit: source, recipe: { kind: "finisher", source } }
            : x,
        );
      });
      setSheet(null);
    } finally {
      setEditBusy(false);
    }
  }

  function cycleOpacity(id: string) {
    setStickers((s) => s.map((x) => (x.id === id ? { ...x, opacity: x.opacity <= 0.25 ? 1 : x.opacity - 0.25 } : x)));
  }

  function duplicate(s: Sticker) {
    const copy = { ...s, id: uid(), x: s.x + 40, y: s.y + 40 };
    setStickers((list) => [...list, copy]);
    setSelected(copy.id);
  }

  // ---- Export ----
  const [exported, setExported] = useState<{ file: File; url: string } | null>(null);
  const backgrounds = panes(format, split)
    .map((pane, i) => ({ bg: i === 0 ? bg : bg2, pane }))
    .filter((x): x is { bg: Background; pane: Rect } => !!x.bg);
  const maxMult = maxMultiplier(format, backgrounds.map((x) => x.bg));

  async function doExport(mult: number) {
    setBusy(true);
    try {
      const blob = await renderImage(format, backgrounds, split, stickers, mult);
      const file = new File([blob], `paceframe-${format.id}-${Date.now()}.png`, { type: "image/png" });
      if (exported) URL.revokeObjectURL(exported.url);
      setExported({ file, url: URL.createObjectURL(blob) });
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!exported) return;
    if (navigator.canShare?.({ files: [exported.file] })) {
      try {
        await navigator.share({ files: [exported.file] });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    download();
  }

  function download() {
    if (!exported) return;
    const a = document.createElement("a");
    a.href = exported.url;
    a.download = exported.file.name;
    a.click();
  }

  function closeExport() {
    if (exported) URL.revokeObjectURL(exported.url);
    setExported(null);
    setSheet(null);
  }

  const empty = !bg && !bg2 && stickers.length === 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0b0b0c] text-white select-none">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2">
        <button
          onClick={() => setSheet("format")}
          className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-medium active:bg-white/20"
        >
          <span>{format.label}</span>
          <span className="text-white/50">{format.ratio}</span>
          <ChevronDown size={16} className="text-white/60" />
        </button>
        <button
          disabled={empty}
          onClick={() => setSheet("export")}
          className="flex h-10 items-center gap-1.5 rounded-full bg-[#fc4c02] px-5 text-sm font-semibold active:brightness-90 disabled:opacity-30"
        >
          <Download size={16} strokeWidth={2.5} />
          Export
        </button>
      </header>

      {/* Stage */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 px-3 py-1">
        <div className="flex h-full w-full items-center justify-center">
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative touch-none overflow-hidden rounded-xl bg-[#1a1a1d] shadow-2xl"
            style={{ width: dispW, height: dispW * (format.h / format.w) }}
          >
            {panes(format, split).map((pane, i) => {
              const b = i === 0 ? bg : bg2;
              return (
                // Each photo is clipped to its pane.
                <div
                  key={i}
                  className="absolute overflow-hidden"
                  style={{ left: pane.x * k, top: pane.y * k, width: pane.w * k, height: pane.h * k }}
                >
                  {b ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.src}
                      alt=""
                      draggable={false}
                      className="pointer-events-none absolute max-w-none"
                      style={{
                        width: b.nw * b.scale * k,
                        height: b.nh * b.scale * k,
                        left: (b.x - (b.nw * b.scale) / 2 - pane.x) * k,
                        top: (b.y - (b.nh * b.scale) / 2 - pane.y) * k,
                      }}
                    />
                  ) : (
                    split !== "none" && (
                      <button
                        onClick={() => pickPhoto(i as 0 | 1)}
                        className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/60 active:text-white"
                      >
                        <ImagePlus size={24} />
                        <span className="text-xs font-semibold">{i === 0 ? "Then photo" : "Now photo"}</span>
                      </button>
                    )
                  )}
                </div>
              );
            })}
            {split !== "none" && (
              <div
                className="pointer-events-none absolute bg-white"
                style={
                  split === "side"
                    ? { left: (format.w / 2 - DIVIDER / 2) * k, top: 0, width: DIVIDER * k, height: "100%" }
                    : { top: (format.h / 2 - DIVIDER / 2) * k, left: 0, height: DIVIDER * k, width: "100%" }
                }
              />
            )}

            {stickers.map((s) => (
              <div
                key={s.id}
                data-sticker={s.id}
                className="absolute"
                style={{
                  left: s.x * k,
                  top: s.y * k,
                  width: s.nw * s.scale * k,
                  height: s.nh * s.scale * k,
                  transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                  opacity: s.opacity,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt="" draggable={false} className="pointer-events-none h-full w-full" />
                {s.id === selected && (
                  <>
                    <div className="pointer-events-none absolute -inset-1 rounded border-2 border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.4)]" />
                    <div
                      data-handle
                      onPointerDown={(e) => onHandleDown(e, s.id)}
                      className="absolute -right-5 -bottom-5 flex h-10 w-10 touch-none items-center justify-center"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-lg">
                        <Maximize2 size={14} strokeWidth={2.5} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}

            {selected === GROUP && grouped && (() => {
              const b = bounds(groupMembers);
              const pad = 8;
              return (
                <div
                  data-group
                  className="absolute rounded-lg border-2 border-dashed border-white/90 bg-white/5 shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
                  style={{ left: b.x0 * k - pad, top: b.y0 * k - pad, width: (b.x1 - b.x0) * k + pad * 2, height: (b.y1 - b.y0) * k + pad * 2 }}
                >
                  <div className="pointer-events-none absolute -top-7 left-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">
                    Group · {groupMembers.length}
                  </div>
                  <div
                    data-handle
                    onPointerDown={(e) => onHandleDown(e, GROUP)}
                    className="absolute -right-5 -bottom-5 flex h-10 w-10 touch-none items-center justify-center"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-lg">
                      <Maximize2 size={14} strokeWidth={2.5} />
                    </div>
                  </div>
                </div>
              );
            })()}

            {guides.v && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-[#fc4c02]" />}
            {guides.h && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[#fc4c02]" />}

            {!bg && split === "none" && stickers.length === 0 && (
              <button
                onClick={() => pickPhoto(0)}
                className="absolute inset-0 m-auto flex h-fit w-fit flex-col items-center gap-3 rounded-2xl p-6 text-white/70 active:text-white"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                  <ImagePlus size={28} />
                </div>
                <span className="text-sm font-medium">Choose a photo</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom toolbar */}
      <nav className="px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        {selected === GROUP && grouped ? (
          <div className="-mx-3 flex items-center justify-between gap-1 overflow-x-auto px-3 [scrollbar-width:none]">
            <Tool label="Done" onClick={() => setSelected(null)} icon={Check} />
            <Tool label="Re-arrange" onClick={() => arrange(layout, opts, true, stickers, format, false)} icon={RefreshCw} />
            {groupSource && runTemplate && <Tool label="Add runs" onClick={() => setSheet("addRuns")} icon={Plus} accent />}
            {editable && <Tool label="Edit card" onClick={openEdit} icon={PencilLine} />}
            <Tool label="Colors" onClick={() => setSheet("color")} icon={Palette} />
            {groupMembers.some(hasText) && <Tool label="Text" onClick={() => setSheet("text")} icon={Type} />}
            <Tool label="Center" onClick={centerGroup} icon={Crosshair} />
            <Tool label="Layout" onClick={() => setSheet("layout")} icon={LayoutGrid} />
            {TUNABLE.includes(layout) && (
              <Tool label="Adjust" onClick={() => setSheet("tune")} icon={SlidersHorizontal} />
            )}
            <Tool
              label="Ungroup"
              onClick={() =>
                setConfirm({
                  title: "Ungroup stickers?",
                  message:
                    "Each sticker will move on its own. Re-arrange, Add runs and layout changes only work on a group, but you can group them again anytime.",
                  action: "Ungroup",
                  run: ungroup,
                })
              }
              icon={Ungroup}
            />
          </div>
        ) : sel ? (
          <div className="-mx-3 flex items-center justify-between gap-1 overflow-x-auto px-3 [scrollbar-width:none]">
            <Tool label="Done" onClick={() => setSelected(null)} icon={Check} />
            {groupIds.includes(sel.id) && grouped && <Tool label="Group" onClick={() => setSelected(GROUP)} icon={LayoutGrid} />}
            {runOf(sel) && <Tool label="Swap run" onClick={() => setSheet("swap")} icon={Replace} />}
            {layout === "wrap" && groupIds.includes(sel.id) && grouped && (
              <Tool label="Set as hero" onClick={() => makeHero(sel.id)} icon={Star} />
            )}
            {sel.edit && <Tool label="Edit" onClick={openEdit} icon={PencilLine} />}
            {colorable(sel) && <Tool label="Color" onClick={() => setSheet("color")} icon={Palette} />}
            {hasText(sel) && <Tool label="Text" onClick={() => setSheet("text")} icon={Type} />}
            <Tool label="Back" onClick={() => reorder(sel.id, -1)} icon={SendToBack} />
            <Tool label="Front" onClick={() => reorder(sel.id, 1)} icon={BringToFront} />
            <Tool
              label={`${Math.round(sel.opacity * 100)}%`}
              onClick={() => cycleOpacity(sel.id)}
              icon={Contrast}
            />
            <Tool label="Straighten" onClick={() => update(sel.id, { rotation: 0 })} icon={RotateCcw} />
            <Tool label="Copy" onClick={() => duplicate(sel)} icon={Copy} />
            <Tool label="Delete" onClick={() => removeSticker(sel.id)} icon={Trash2} danger />
          </div>
        ) : (
          <div className="flex items-center justify-around gap-1">
            <Tool label={bg ? "Photo" : "Add photo"} onClick={() => setSheet("photo")} icon={bg ? ImageIcon : ImagePlus} />
            <Tool label="Stickers" onClick={() => stickerInput.current?.click()} icon={Plus} accent />
            <Tool label="Strava" onClick={() => setSheet("strava")} icon={Footprints} />
            {stickers.some(colorable) && <Tool label="Colors" onClick={() => setSheet("color")} icon={Palette} />}
            {stickers.some(hasText) && <Tool label="Text" onClick={() => setSheet("text")} icon={Type} />}
            <Tool
              label="Layout"
              onClick={() => setSheet("layout")}
              disabled={stickers.length < 1}
              icon={LayoutGrid}
            />
            {stickers.length > 1 && (
              <Tool
                label={grouped ? "Select group" : "Group all"}
                onClick={() =>
                  grouped
                    ? groupAll()
                    : setConfirm({
                        title: "Group all stickers?",
                        message: `All ${stickers.filter((s) => !s.deco).length} stickers will move together as one, including ones you placed by hand.`,
                        action: "Group all",
                        run: groupAll,
                      })
                }
                icon={Group}
              />
            )}
          </div>
        )}
        <p className="mt-2 text-center text-[11px] text-white/40">
          {selected === GROUP && grouped
            ? "Drag to move the whole group · double-tap a sticker to edit just that one"
            : sel
            ? "Drag to move · pinch or use the corner handle to resize & rotate"
            : stickers.length
              ? `${stickers.length} sticker${stickers.length > 1 ? "s" : ""} · tap one to edit · ${photoLocked ? "photo locked" : "drag/pinch the photo to reframe"}`
              : "Add sticker PNGs from your gallery, or make them from a Strava activity"}
        </p>
      </nav>

      <input
        ref={shapeInput}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => (onShapeFile(e.target.files), (e.target.value = ""))}
      />
      <input ref={photoInput} type="file" accept="image/*" className="sr-only" onChange={(e) => (onPhoto(e.target.files), (e.target.value = ""))} />
      <input
        ref={stickerInput}
        type="file"
        accept="image/png,image/webp,image/*"
        multiple
        className="sr-only"
        onChange={(e) => (onStickers(e.target.files), (e.target.value = ""))}
      />

      <InstallPrompt />

      {handoff && (
        <BottomSheet title="Strava connected" onClose={() => setHandoff(null)}>
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-white/70">
              You started from the <b>Paceframe app</b> on your Home Screen, but iPhone finished the login here in Safari. To log in the
              app too:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-white/70">
              <li>
                Tap <b>Copy code</b>
              </li>
              <li>Open Paceframe from your Home Screen</li>
              <li>
                Strava → <b>Paste code</b>
              </li>
            </ol>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(handoff);
                  setToast("Code copied. Open Paceframe from your Home Screen (valid for 10 minutes).");
                } catch {
                  setToast("Couldn't copy automatically. Long-press the code below to copy it.");
                }
              }}
              className="h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90"
            >
              Copy code
            </button>
            <p className="max-h-20 overflow-y-auto rounded-xl bg-white/5 p-2 font-mono text-[10px] break-all text-white/40 select-all">{handoff}</p>
            <button onClick={() => (setHandoff(null), setSheet("strava"))} className="text-sm text-white/60">
              Continue in Safari instead
            </button>
          </div>
        </BottomSheet>
      )}

      {toast && (
        <div className="fixed inset-x-4 top-[max(env(safe-area-inset-top),12px)] z-[60] rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black shadow-xl">
          {toast}
        </div>
      )}

      {/* Sheets */}
      {sheet === "format" && (
        <BottomSheet title="Format" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-3 gap-3">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => changeFormat(f)}
                className={`flex flex-col items-center gap-2 rounded-2xl p-3 ${f.id === format.id ? "bg-white/15 ring-2 ring-[#fc4c02]" : "bg-white/5"}`}
              >
                <div className="flex h-16 items-center">
                  <div className="rounded-md border-2 border-white/70" style={{ width: (56 * f.w) / 1920, height: (56 * f.h) / 1920 }} />
                </div>
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-[11px] text-white/50">
                  {f.w}×{f.h}
                </span>
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {sheet === "layout" && (
        <BottomSheet title="Arrange stickers" onClose={() => setSheet(null)}>
          <button
            onClick={() => setSheet(null)}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-white/5 p-4 text-left active:bg-white/10"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fc4c02]/20 text-[#fc4c02]">
              <Move size={20} />
            </div>
            <div>
              <div className="font-semibold">Freeform</div>
              <div className="text-xs text-white/50">Move each sticker yourself</div>
            </div>
          </button>
          <button
            onClick={() => shapeInput.current?.click()}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-white/5 p-4 text-left active:bg-white/10"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fc4c02]/20 text-[#fc4c02]">
              <Shapes size={20} />
            </div>
            <div>
              <div className="font-semibold">Shape from image</div>
              <div className="text-xs text-white/50">Upload a logo or silhouette, and stickers take its shape</div>
            </div>
          </button>
          <button
            onClick={pickWrap}
            disabled={detecting}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-white/5 p-4 text-left active:bg-white/10 disabled:opacity-50"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fc4c02]/20 text-[#fc4c02]">
              <PersonStanding size={20} />
            </div>
            <div>
              <div className="font-semibold">{detecting ? "Finding the person…" : "Wrap around subject"}</div>
              <div className="text-xs text-white/50">A tilted field of stickers that flows around the person in your photo, with an optional hero in the center</div>
            </div>
          </button>
          <div className="grid grid-cols-3 gap-2.5">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => pickLayout(l.id)}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/5 px-2 py-3 active:bg-white/10"
              >
                <LayoutPreview id={l.id} />
                <span className="text-sm font-medium">{l.label}</span>
                <span className="text-center text-[10px] leading-tight text-white/45">{l.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-white/40">You can still move stickers after picking a shape.</p>
        </BottomSheet>
      )}

      {sheet === "tune" && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-[#18181b] px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-8px_30px_rgba(0,0,0,.5)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{LAYOUTS.find((l) => l.id === layout)?.label ?? "Shape"}</h2>
            <button onClick={() => setSheet(null)} className="h-9 rounded-full bg-[#fc4c02] px-5 text-sm font-semibold">
              Done
            </button>
          </div>
          {layout === "wrap" ? (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 flex justify-between text-xs text-white/50">
                  <span>Angle</span>
                  <span className="tabular-nums text-white/80">{opts.angle}°</span>
                </div>
                <input
                  type="range"
                  min={-60}
                  max={60}
                  step={5}
                  value={opts.angle}
                  onChange={(e) => tune({ angle: Number(e.target.value) })}
                  className="h-8 w-full accent-[#fc4c02]"
                  aria-label="Angle"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-white/50">
                  <span>Spacing</span>
                  <span className="tabular-nums text-white/80">{Math.round(opts.spacing * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.04}
                  value={opts.spacing}
                  onChange={(e) => tune({ spacing: Number(e.target.value) })}
                  className="h-8 w-full accent-[#fc4c02]"
                  aria-label="Spacing"
                />
              </div>
              <Toggle
                label={subject?.src === bg?.src && subject ? "Keep the person clear" : "Keep the person clear (no person found)"}
                on={opts.avoidSubject && !!subject}
                onClick={() => subject && tune({ avoidSubject: !opts.avoidSubject })}
              />
              <Toggle label="Big hero sticker (near the center, off the person)" on={opts.heroCenter} onClick={() => tune({ heroCenter: !opts.heroCenter })} />
              {opts.heroCenter && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-white/50">
                    <span>Hero size</span>
                    <span className="tabular-nums text-white/80">{Math.round(opts.heroSize * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={0.8}
                    step={0.05}
                    value={opts.heroSize}
                    onChange={(e) => tune({ heroSize: Number(e.target.value) })}
                    className="h-8 w-full accent-[#fc4c02]"
                    aria-label="Hero size"
                  />
                  <p className="mt-1 text-[11px] text-white/40">Pick the hero: double-tap a sticker → Set as hero.</p>
                </div>
              )}
            </div>
          ) : layout === "spiral" ? (
            <div className="flex flex-col gap-2">
              <Toggle
                label={stickers.some((s) => s.weight) ? "Size by distance (longer runs bigger)" : "Size by distance (Strava routes only)"}
                on={opts.bySize}
                onClick={() => tune({ bySize: !opts.bySize })}
              />
              <Toggle label="Show spiral path" on={opts.path} onClick={() => tune({ path: !opts.path })} />
            </div>
          ) : layout === "shape" ? (
            <div className="flex flex-col gap-3">
              <div className="flex rounded-xl bg-white/5 p-1 text-sm">
                {(
                  [
                    ["fill", "Fill", "Inside the shape"],
                    ["outline", "Outline", "Along its edge"],
                  ] as const
                ).map(([m, label, hint]) => (
                  <button
                    key={m}
                    onClick={() => tune({ shapeMode: m })}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-center ${opts.shapeMode === m ? "bg-white text-black" : "text-white/60"}`}
                  >
                    <div className="font-semibold">{label}</div>
                    <div className={`text-[10px] ${opts.shapeMode === m ? "text-black/60" : "text-white/40"}`}>{hint}</div>
                  </button>
                ))}
              </div>
              <Toggle label="Show silhouette behind stickers" on={opts.silhouette} onClick={() => tune({ silhouette: !opts.silhouette })} />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={toggleInvert} disabled={!shapeImg} className="h-11 rounded-xl bg-white/5 text-sm font-medium disabled:opacity-30">
                  {invertShape ? "Shape: inverted" : "Invert shape"}
                </button>
                <button onClick={() => shapeInput.current?.click()} className="h-11 rounded-xl bg-white/5 text-sm font-medium">
                  Change image
                </button>
              </div>
            </div>
          ) : layout === "timeline" ? (
            <div className="flex flex-col gap-3">
              <div className="flex rounded-xl bg-white/5 p-1 text-sm">
                {(
                  [
                    [false, "Vertical", ArrowDown],
                    [true, "Horizontal", ArrowRight],
                  ] as const
                ).map(([h, label, Glyph]) => (
                  <button
                    key={label}
                    onClick={() => tune({ horizontal: h })}
                    className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold ${opts.horizontal === h ? "bg-white text-black" : "text-white/60"}`}
                  >
                    <Glyph size={16} />
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => tune({ zigzag: !opts.zigzag })}
                className="flex h-11 w-full items-center justify-between rounded-xl bg-white/5 px-4 text-sm"
              >
                <span>Zigzag (alternate sides, bigger stickers)</span>
                <span className={`relative h-6 w-10 rounded-full transition-colors ${opts.zigzag ? "bg-[#fc4c02]" : "bg-white/20"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${opts.zigzag ? "left-[18px]" : "left-0.5"}`} />
                </span>
              </button>
              <Toggle label="Race finale (last sticker big, at the end)" on={opts.hero} onClick={() => tune({ hero: !opts.hero })} />
            </div>
          ) : (
          <>
          <div className="mb-1 text-xs text-white/50">{layout === "arc" ? "Stickers per arc" : "Columns"}</div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => tune({ cols: opts.cols - 1 })}
              disabled={opts.cols <= 1}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
              aria-label="Fewer columns"
            >
              <Minus size={18} />
            </button>
            <div className="flex flex-1 justify-between gap-1">
              {Array.from({ length: Math.min(MAX_COLS, stickers.length) }, (_, i) => i + 1).map((c) => (
                <button
                  key={c}
                  onClick={() => tune({ cols: c })}
                  className={`h-11 flex-1 rounded-xl text-sm font-semibold ${c === opts.cols ? "bg-white text-black" : "bg-white/5 text-white/70"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={() => tune({ cols: opts.cols + 1 })}
              disabled={opts.cols >= Math.min(MAX_COLS, stickers.length)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
              aria-label="More columns"
            >
              <Plus size={18} />
            </button>
          </div>
          </>
          )}

          {layout === "arc" && (
            <>
              <div className="mt-4 mb-1 flex items-center justify-between text-xs text-white/50">
                <span>Bend</span>
                <span className="tabular-nums text-white/80">
                  {Math.abs(opts.bend) < 5 ? "Straight" : `${Math.abs(opts.bend)}° ${opts.bend > 0 ? "∩" : "∪"}`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg text-white/50">∪</span>
                <input
                  type="range"
                  min={-240}
                  max={240}
                  step={5}
                  value={opts.bend}
                  onChange={(e) => tune({ bend: Number(e.target.value) })}
                  className="h-11 flex-1 accent-[#fc4c02]"
                  aria-label="Arc bend"
                />
                <span className="text-lg text-white/50">∩</span>
              </div>
              <div className="mt-2 flex gap-2">
                {[-120, -60, 60, 120, 180].map((b) => (
                  <button
                    key={b}
                    onClick={() => tune({ bend: b })}
                    className={`h-9 flex-1 rounded-xl text-xs font-semibold ${opts.bend === b ? "bg-white text-black" : "bg-white/5 text-white/70"}`}
                  >
                    {b > 0 ? "∩" : "∪"} {Math.abs(b)}°
                  </button>
                ))}
              </div>
              <button
                onClick={() => tune({ tilt: !opts.tilt })}
                className="mt-3 flex h-11 w-full items-center justify-between rounded-xl bg-white/5 px-4 text-sm"
              >
                <span>Tilt stickers along the curve</span>
                <span className={`relative h-6 w-10 rounded-full transition-colors ${opts.tilt ? "bg-[#fc4c02]" : "bg-white/20"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${opts.tilt ? "left-[18px]" : "left-0.5"}`} />
                </span>
              </button>
            </>
          )}

          <p className="mt-2 text-center text-[11px] text-white/40">
            {layout === "wrap"
              ? `${stickers.filter((s) => !s.deco).length} stickers around ${subject ? "the person" : "the photo"}${opts.heroCenter ? " and the hero" : ""}`
              : layout === "spiral"
              ? `${stickers.filter((s) => !s.deco).length} stickers, first one in the center`
              : layout === "shape"
              ? `${stickers.filter((s) => !s.deco).length} stickers in your shape`
              : layout === "timeline"
              ? `${stickers.filter((s) => !s.deco).length} stops in sticker order`
              : `${stickers.length} stickers · ${Math.ceil(stickers.length / opts.cols)} ${layout === "arc" ? "arc" : "row"}${Math.ceil(stickers.length / opts.cols) > 1 ? "s" : ""}`}{" "}
            · drag the group to move it
          </p>
        </div>
      )}

      {sheet === "strava" && (
        <BottomSheet title="Strava" onClose={() => setSheet(null)}>
          <StravaPanel hasWork={!empty} error={stravaError} onAdd={addLayers} onThenNow={addThenNow} routeColors={routeColors} textStyle={textStyle} />
        </BottomSheet>
      )}

      {sheet === "edit" && editable?.edit && editDraft && (
        <BottomSheet title="Edit finisher card" onClose={() => setSheet(null)}>
          <CardOptions
            run={editable.edit.run}
            units={editable.edit.units}
            value={editDraft}
            onChange={(patch) => setEditDraft((d) => (d ? { ...d, ...patch } : d))}
          />
          <button
            onClick={applyEdit}
            disabled={editBusy}
            className="mt-4 h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {editBusy ? "Updating…" : "Update card"}
          </button>
        </BottomSheet>
      )}

      {sheet === "photo" && (
        <BottomSheet title="Background" onClose={() => setSheet(null)}>
          <div className="mb-1 text-xs text-white/50">Layout</div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(
              [
                ["none", "One photo"],
                ["side", "Side by side"],
                ["stacked", "Top & bottom"],
              ] as const
            ).map(([sp, label]) => (
              <button
                key={sp}
                onClick={() => setSplit(sp)}
                className={`flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-semibold ${split === sp ? "bg-white/15 ring-2 ring-[#fc4c02]" : "bg-white/5"}`}
              >
                <div className={`flex h-12 w-8 overflow-hidden rounded-md border-2 border-white/70 ${sp === "stacked" ? "flex-col" : ""}`}>
                  <div className="flex-1 bg-white/25" />
                  {sp !== "none" && <div className={`${sp === "side" ? "w-0.5" : "h-0.5"} bg-white`} />}
                  {sp !== "none" && <div className="flex-1 bg-white/10" />}
                </div>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => pickPhoto(0)} className="flex h-12 items-center gap-3 rounded-xl bg-white/5 px-4 text-sm font-medium active:bg-white/10">
              <ImagePlus size={18} />
              {split === "none" ? (bg ? "Change photo" : "Choose photo") : `${split === "side" ? "Left" : "Top"} photo (Then)`}
            </button>
            {split !== "none" && (
              <button onClick={() => pickPhoto(1)} className="flex h-12 items-center gap-3 rounded-xl bg-white/5 px-4 text-sm font-medium active:bg-white/10">
                <ImagePlus size={18} />
                {split === "side" ? "Right" : "Bottom"} photo (Now)
              </button>
            )}
          </div>
          {(bg || bg2) && (
            <div className="mt-3">
              <Toggle label="Lock photo (can't be moved or zoomed)" on={photoLocked} onClick={() => setPhotoLocked((v) => !v)} />
            </div>
          )}
        </BottomSheet>
      )}

      {sheet === "color" && (
        <BottomSheet title="Route colors" onClose={() => setSheet(null)}>
          <RouteColor
            value={routeColors}
            onChange={setRouteColors}
            slot={colorSlot}
            onSlot={setColorSlot}
            canPick={!!(bg || bg2)}
            onPickFromPhoto={() => ((pickFor.current = "route"), setSheet(null), setPicking(true))}
            hasSelection={!!(selected === GROUP ? groupMembers.some(colorable) : sel && colorable(sel))}
            busy={recoloring}
            onApply={applyColors}
          />
        </BottomSheet>
      )}

      {sheet === "addRuns" && groupSource && runTemplate && (
        <BottomSheet title={`Add runs to ${LAYOUTS.find((l) => l.id === layout)?.label ?? "group"}`} onClose={() => setSheet(null)}>
          <AddRuns
            source={groupSource}
            exclude={stickers.map((s) => runOf(s)?.id).filter((x): x is number => x !== undefined)}
            units={runTemplate.recipe && "units" in runTemplate.recipe ? runTemplate.recipe.units : "metric"}
            busy={addingRuns}
            onAdd={addRunsToGroup}
          />
        </BottomSheet>
      )}

      {confirm && (
        <BottomSheet title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="mb-4 text-sm text-white/70">{confirm.message}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirm(null)} className="h-12 rounded-full bg-white/10 font-semibold">
              Cancel
            </button>
            <button
              onClick={() => {
                confirm.run();
                setConfirm(null);
              }}
              className="h-12 rounded-full bg-[#fc4c02] font-semibold active:brightness-90"
            >
              {confirm.action}
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet === "text" && (
        <BottomSheet title="Text style" onClose={() => setSheet(null)}>
          <TextStyleSheet
            value={textStyle}
            onChange={setTextStyle}
            canPick={!!(bg || bg2)}
            onPickFromPhoto={() => ((pickFor.current = "text"), setSheet(null), setPicking(true))}
            hasSelection={!!(selected === GROUP ? groupMembers.some(hasText) : sel && hasText(sel))}
            busy={restyling}
            onApply={applyText}
          />
        </BottomSheet>
      )}

      {picking && (
        <div className="fixed inset-x-4 top-[max(env(safe-area-inset-top),12px)] z-[60] flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black shadow-xl">
          <span>Tap your photo to pick a color</span>
          <button onClick={() => (setPicking(false), setSheet(pickFor.current === "text" ? "text" : "color"))} className="font-semibold text-[#fc4c02]">
            Cancel
          </button>
        </div>
      )}

      {sheet === "swap" && sel && runOf(sel) && (
        <BottomSheet title={swapping ? "Swapping…" : "Swap run"} onClose={() => setSheet(null)}>
          <SwapRun
            current={runOf(sel)!}
            exclude={stickers.map((s) => runOf(s)?.id).filter((x): x is number => x !== undefined)}
            units={sel.recipe && "units" in sel.recipe ? sel.recipe.units : "metric"}
            onPick={(a) => swapRun(sel, a)}
          />
        </BottomSheet>
      )}

      {sheet === "export" && (
        <BottomSheet title="Export" onClose={closeExport}>
          {exported ? (
            <div className="flex flex-col items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={exported.url} alt="Export preview" className="max-h-[40dvh] rounded-lg shadow-xl" />
              <div className="grid w-full grid-cols-2 gap-2.5">
                <button onClick={share} className="h-12 rounded-full bg-[#fc4c02] font-semibold active:brightness-90">
                  Save / Share
                </button>
                <button onClick={download} className="h-12 rounded-full bg-white/10 font-semibold active:bg-white/20">
                  Download
                </button>
              </div>
              <button onClick={() => setExported(null)} className="text-sm text-white/50">
                Back
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <ExportOption
                title="Instagram size"
                sub={`${format.w}×${format.h} PNG · exactly what Instagram keeps`}
                onClick={() => doExport(1)}
                disabled={busy}
              />
              {maxMult > 1.05 && (
                <ExportOption
                  title="Full photo quality"
                  sub={`${Math.round(format.w * maxMult)}×${Math.round(format.h * maxMult)} PNG · keeps your photo's original detail`}
                  onClick={() => doExport(maxMult)}
                  disabled={busy}
                />
              )}
              {busy && <p className="text-center text-sm text-white/60">Rendering…</p>}
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

function Tool({
  label,
  icon: Glyph,
  onClick,
  disabled,
  accent,
  danger,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-w-12 flex-col items-center gap-1 rounded-xl px-1.5 py-1 text-[11px] font-medium disabled:opacity-30 ${danger ? "text-red-400" : "text-white/85"}`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full ${accent ? "bg-[#fc4c02] text-white" : "bg-white/10"} active:scale-95`}
      >
        <Glyph size={20} strokeWidth={2} />
      </span>
      {label}
    </button>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-11 w-full items-center justify-between rounded-xl bg-white/5 px-4 text-sm">
      <span>{label}</span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-[#fc4c02]" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-[#18181b] px-4 pt-2 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ExportOption({ title, sub, onClick, disabled }: { title: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between rounded-2xl bg-white/5 p-4 text-left active:bg-white/10 disabled:opacity-40"
    >
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-white/50">{sub}</div>
      </div>
      <ChevronRight size={18} className="text-white/50" />
    </button>
  );
}

// Deterministic random so the scatter preview doesn't jump between renders.
function seeded(seed: number) {
  return () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
}

/** Tiny schematic of each layout using five placeholder boxes. */
function LayoutPreview({ id }: { id: LayoutId }) {
  const items = Array.from({ length: 5 }, () => ({ nw: 300, nh: 110 }));
  const t = applyLayout(id, items, 1080, 1920, { rand: seeded(7) });
  const s = 56 / 1920;
  return (
    <div className="relative rounded-md bg-white/10" style={{ width: 1080 * s, height: 1920 * s }}>
      {t.map((p, i) => (
        <div
          key={i}
          className={`absolute rounded-[2px] ${i === 0 ? "bg-[#fc4c02]" : "bg-white/70"}`}
          style={{
            left: p.x * s,
            top: p.y * s,
            width: 300 * p.scale * s,
            height: 110 * p.scale * s,
            transform: `translate(-50%,-50%) rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}
