"use client";

import { useState } from "react";
import { Minus, Pipette, Plus } from "lucide-react";
import { GRADIENT_PRESETS, parseHex, SOLID_PRESETS, styleCss, toHex, type RouteStyle } from "./routeStyle";

const MAX_COLORS = { solid: 1, gradient: 5, palette: 6 } as const;

/**
 * Route color editor: solid / gradient / multi-color, with presets, a native picker, hex input,
 * and an eyedropper that samples the background photo (handled by the editor via `onPickFromPhoto`).
 */
export default function RouteColor({
  value,
  onChange,
  slot,
  onSlot,
  canPick,
  onPickFromPhoto,
  hasSelection,
  busy,
  onApply,
}: {
  value: RouteStyle;
  onChange: (v: RouteStyle) => void;
  /** Which color stop is being edited. */
  slot: number;
  onSlot: (i: number) => void;
  canPick: boolean;
  onPickFromPhoto: () => void;
  hasSelection: boolean;
  busy: boolean;
  onApply: (scope: "selected" | "all") => void;
}) {
  const active = Math.min(slot, value.colors.length - 1);
  const current = value.colors[active];
  // Hex field keeps its own text while typing; it follows the active color otherwise.
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const setColor = (c: string) => onChange({ ...value, colors: value.colors.map((x, i) => (i === active ? c.toUpperCase() : x)) });

  function setMode(mode: RouteStyle["mode"]) {
    const colors =
      mode === "solid"
        ? [value.colors[0]]
        : value.colors.length >= 2
          ? value.colors.slice(0, MAX_COLORS[mode])
          : [value.colors[0], mode === "gradient" ? "#FFD200" : "#FFFFFF"];
    onChange({ ...value, mode, colors });
    onSlot(0);
  }

  function addStop() {
    if (value.colors.length >= MAX_COLORS[value.mode]) return;
    onChange({ ...value, colors: [...value.colors, value.colors[value.colors.length - 1]] });
    onSlot(value.colors.length);
  }

  function removeStop() {
    if (value.colors.length <= 2) return;
    onChange({ ...value, colors: value.colors.filter((_, i) => i !== active) });
    onSlot(Math.max(0, active - 1));
  }

  function commitHex(text: string) {
    const rgb = parseHex(text);
    if (rgb) setColor(toHex(...rgb));
    setHexDraft(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="h-3 w-full rounded-full" style={{ background: styleCss(value) }} />

      <div className="flex rounded-xl bg-white/5 p-1 text-sm">
        {(
          [
            ["solid", "Solid"],
            ["gradient", "Gradient"],
            ["palette", "Multi-color"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`h-9 flex-1 rounded-lg font-semibold ${value.mode === m ? "bg-white text-black" : "text-white/60"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === "gradient" && (
        <div className="flex rounded-xl bg-white/5 p-1 text-xs">
          {(
            [
              ["each", "Along each route", "Start → finish"],
              ["across", "Across runs", "First run → last run"],
            ] as const
          ).map(([sp, label, hint]) => (
            <button
              key={sp}
              onClick={() => onChange({ ...value, spread: sp })}
              className={`flex-1 rounded-lg px-2 py-1.5 ${value.spread === sp ? "bg-white text-black" : "text-white/60"}`}
            >
              <div className="font-semibold">{label}</div>
              <div className={`text-[10px] ${value.spread === sp ? "text-black/60" : "text-white/40"}`}>{hint}</div>
            </button>
          ))}
        </div>
      )}

      {/* Color stops: tap one to edit it. */}
      <div className="flex items-center gap-2">
        {value.colors.map((c, i) => (
          <button
            key={i}
            onClick={() => onSlot(i)}
            aria-label={`Color ${i + 1}`}
            className={`h-10 w-10 shrink-0 rounded-full border-2 border-white/20 ${i === active && value.colors.length > 1 ? "ring-2 ring-white ring-offset-2 ring-offset-[#18181b]" : ""}`}
            style={{ background: c }}
          />
        ))}
        {value.mode !== "solid" && (
          <>
            <button
              onClick={addStop}
              disabled={value.colors.length >= MAX_COLORS[value.mode]}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
              aria-label="Add color"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={removeStop}
              disabled={value.colors.length <= 2}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
              aria-label="Remove selected color"
            >
              <Minus size={18} />
            </button>
          </>
        )}
      </div>

      {value.mode !== "solid" && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {GRADIENT_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => (onChange({ ...value, colors: p.colors.slice(0, MAX_COLORS[value.mode]) }), onSlot(0))}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              <span className="h-8 w-16 rounded-lg" style={{ background: `linear-gradient(90deg, ${p.colors.join(", ")})` }} />
              <span className="text-[10px] text-white/60">{p.name}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1.5 text-xs text-white/50">{value.colors.length > 1 ? `Color ${active + 1}` : "Color"}</div>
        <div className="grid grid-cols-6 gap-2">
          {SOLID_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              className={`aspect-square rounded-full border-2 ${current.toUpperCase() === c.toUpperCase() ? "border-white" : "border-white/15"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border-2 border-white/20" style={{ background: current }}>
          <input
            type="color"
            value={current.toLowerCase()}
            onChange={(e) => setColor(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Pick a custom color"
          />
        </label>
        <input
          value={hexDraft ?? current}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={(e) => commitHex(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commitHex((e.target as HTMLInputElement).value)}
          spellCheck={false}
          autoCapitalize="characters"
          aria-label="Hex color"
          className="h-11 min-w-0 flex-1 rounded-xl bg-white/10 px-3 font-mono text-sm uppercase focus:ring-2 focus:ring-[#fc4c02] focus:outline-none"
        />
        <button
          onClick={onPickFromPhoto}
          disabled={!canPick}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold disabled:opacity-30"
        >
          <Pipette size={16} />
          From photo
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {hasSelection && (
          <button
            onClick={() => onApply("selected")}
            disabled={busy}
            className="h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {busy ? "Recoloring…" : "Apply to selected"}
          </button>
        )}
        <button
          onClick={() => onApply("all")}
          disabled={busy}
          className={`h-12 w-full rounded-full font-semibold disabled:opacity-40 ${hasSelection ? "bg-white/10" : "bg-[#fc4c02] active:brightness-90"}`}
        >
          {busy && !hasSelection ? "Recoloring…" : "Apply to all routes"}
        </button>
        <p className="text-center text-[11px] text-white/40">New Strava stickers will also use these colors.</p>
      </div>
    </div>
  );
}
