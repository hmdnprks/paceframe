"use client";

import { Check } from "lucide-react";
import type { Activity } from "@/app/lib/activity";
import {
  CARD_METRICS,
  cardMetricValue,
  duration,
  MAX_CARD_METRICS,
  resultSeconds,
  type CardMetric,
  type ResultTime,
  type Units,
} from "./stravaStickers";

export type CardSettings = { time: ResultTime; pr: boolean; metrics: CardMetric[] };

/** Finisher card settings: which finish time, which metrics (only ones with data), PR badge. */
export default function CardOptions({
  run,
  units,
  value,
  onChange,
}: {
  run: Activity;
  units: Units;
  value: CardSettings;
  onChange: (patch: Partial<CardSettings>) => void;
}) {
  const available = CARD_METRICS.filter((m) => cardMetricValue(run, m.key, value.time, units));
  const chosen = value.metrics.filter((k) => available.some((m) => m.key === k));
  const toggle = (k: CardMetric) =>
    onChange({
      metrics: chosen.includes(k) ? chosen.filter((x) => x !== k) : chosen.length < MAX_CARD_METRICS ? [...chosen, k] : chosen,
    });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 text-xs text-white/50">Finish time</div>
        <div className="flex rounded-xl bg-black/20 p-1 text-sm">
          {(
            [
              ["elapsed", "Elapsed", "Closest to chip time"],
              ["moving", "Moving", "Excludes stops"],
            ] as const
          ).map(([t, label, hint]) => (
            <button
              key={t}
              onClick={() => onChange({ time: t })}
              className={`flex-1 rounded-lg px-2 py-1.5 text-center ${value.time === t ? "bg-white text-black" : "text-white/60"}`}
            >
              <div className="font-semibold">
                {label}
                <span className="ml-1.5 font-medium tabular-nums opacity-60">{duration(resultSeconds(run, t))}</span>
              </div>
              <div className={`text-[10px] ${value.time === t ? "text-black/60" : "text-white/40"}`}>{hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-white/50">
          <span>Metrics on the card</span>
          <span>
            {chosen.length}/{MAX_CARD_METRICS}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {available.map((m) => {
            const on = chosen.includes(m.key);
            const full = !on && chosen.length >= MAX_CARD_METRICS;
            return (
              <button
                key={m.key}
                onClick={() => toggle(m.key)}
                disabled={full}
                className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-30 ${on ? "bg-[#fc4c02] text-white" : "bg-white/10 text-white/70"}`}
              >
                {on && <Check size={13} strokeWidth={3} />}
                {m.label}
                <span className={`font-medium tabular-nums ${on ? "text-white/75" : "text-white/40"}`}>
                  {cardMetricValue(run, m.key, value.time, units)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ToggleRow label="Mark as PR (personal record)" on={value.pr} onClick={() => onChange({ pr: !value.pr })} />
    </div>
  );
}

export function ToggleRow({ label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-full items-center justify-between rounded-xl bg-black/20 px-4 text-sm disabled:opacity-40"
    >
      <span>{label}</span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-[#fc4c02]" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
