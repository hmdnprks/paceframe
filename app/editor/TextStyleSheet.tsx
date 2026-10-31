"use client";

import { useState } from "react";
import { Pipette } from "lucide-react";
import { parseHex, SOLID_PRESETS, toHex } from "./routeStyle";
import { FONTS, SIZES, type TextStyle } from "./textStyle";

/** Sticker text: size (relative to the route), metrics layout, font and color. */
export default function TextStyleSheet({
  value,
  onChange,
  canPick,
  onPickFromPhoto,
  hasSelection,
  busy,
  onApply,
}: {
  value: TextStyle;
  onChange: (v: TextStyle) => void;
  canPick: boolean;
  onPickFromPhoto: () => void;
  hasSelection: boolean;
  busy: boolean;
  onApply: (scope: "selected" | "all") => void;
}) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const set = (patch: Partial<TextStyle>) => onChange({ ...value, ...patch });

  function commitHex(text: string) {
    const rgb = parseHex(text);
    if (rgb) set({ color: toHex(...rgb) });
    setHexDraft(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 text-xs text-white/50">Text size</div>
        <div className="flex rounded-xl bg-white/5 p-1">
          {SIZES.map((s) => (
            <button
              key={s.label}
              onClick={() => set({ scale: s.scale })}
              className={`h-10 flex-1 rounded-lg font-bold ${value.scale === s.scale ? "bg-white text-black" : "text-white/60"}`}
              style={{ fontSize: 11 + s.scale * 5 }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-white/50">Metrics layout (run stickers)</div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["row", "Row"],
              ["stack", "Stack"],
              ["side", "Side"],
            ] as const
          ).map(([l, label]) => (
            <button
              key={l}
              onClick={() => set({ layout: l })}
              className={`flex flex-col items-center gap-2 rounded-xl p-2.5 text-xs font-semibold ${value.layout === l ? "bg-white/15 ring-2 ring-[#fc4c02]" : "bg-white/5"}`}
            >
              {/* Mini schematic: orange = route, white bars = metrics. */}
              <div className={`flex h-12 w-16 items-center justify-center gap-1 ${l === "side" ? "flex-row" : "flex-col"}`}>
                <div className={`rounded-sm border-2 border-[#fc4c02] ${l === "side" ? "h-9 w-6" : "h-5 w-8"}`} />
                <div className={`flex gap-0.5 ${l === "row" ? "flex-row" : "flex-col"}`}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`rounded-full bg-white/80 ${l === "row" ? "h-1.5 w-3" : "h-1.5 w-5"}`} />
                  ))}
                </div>
              </div>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-white/50">Font</div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => set({ font: f.id })}
              className={`h-11 shrink-0 rounded-xl px-4 text-base font-bold ${value.font === f.id ? "bg-white text-black" : "bg-white/10 text-white/80"}`}
              style={{ fontFamily: `var(${f.cssVar})` }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-white/50">Color</div>
        <div className="mb-2 grid grid-cols-6 gap-2">
          {SOLID_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => set({ color: c })}
              aria-label={c}
              className={`aspect-square rounded-full border-2 ${value.color.toUpperCase() === c.toUpperCase() ? "border-white" : "border-white/15"}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border-2 border-white/20" style={{ background: value.color }}>
            <input
              type="color"
              value={value.color.toLowerCase()}
              onChange={(e) => set({ color: e.target.value.toUpperCase() })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Pick a custom text color"
            />
          </label>
          <input
            value={hexDraft ?? value.color}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={(e) => commitHex(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitHex((e.target as HTMLInputElement).value)}
            spellCheck={false}
            autoCapitalize="characters"
            aria-label="Hex text color"
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
      </div>

      <div className="flex flex-col gap-2">
        {hasSelection && (
          <button
            onClick={() => onApply("selected")}
            disabled={busy}
            className="h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {busy ? "Updating…" : "Apply to selected"}
          </button>
        )}
        <button
          onClick={() => onApply("all")}
          disabled={busy}
          className={`h-12 w-full rounded-full font-semibold disabled:opacity-40 ${hasSelection ? "bg-white/10" : "bg-[#fc4c02] active:brightness-90"}`}
        >
          {busy && !hasSelection ? "Updating…" : "Apply to all Strava stickers"}
        </button>
        <p className="text-center text-[11px] text-white/40">New Strava stickers will also use this style. Stickers keep their width, so bigger text makes the route relatively smaller.</p>
      </div>
    </div>
  );
}
