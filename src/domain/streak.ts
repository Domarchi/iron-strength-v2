// Racha en semanas (RF-29, DC-11). Una semana cuenta si se cumplieron TODAS sus sesiones
// planificadas. Las semanas de descarga (sin sesiones) y las semanas sin programa no suman ni
// rompen. Los entrenamientos extra no intervienen: el cumplimiento ya los ignora.
import type { DateString } from "./dates";
import type { WeekCompliance } from "./completion";

export type WeekOutcome = {
  weekStart: DateString;
  // complete: todas hechas · missed: terminó incompleta · in_progress: aún se puede completar
  // neutral: descarga o sin programa
  outcome: "complete" | "missed" | "in_progress" | "neutral";
};

export function weekOutcome(
  compliance: WeekCompliance,
  weekEnded: boolean,
): WeekOutcome["outcome"] {
  if (compliance.deload) return "neutral";
  if (compliance.complete) return "complete";
  return weekEnded ? "missed" : "in_progress";
}

export function streaks(weeks: WeekOutcome[]): { current: number; longest: number } {
  const ordered = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  let run = 0;
  let longest = 0;
  for (const { outcome } of ordered) {
    if (outcome === "complete") {
      run += 1;
      longest = Math.max(longest, run);
    } else if (outcome === "missed") {
      run = 0;
    }
    // neutral e in_progress: ni suman ni rompen
  }

  return { current: run, longest };
}
