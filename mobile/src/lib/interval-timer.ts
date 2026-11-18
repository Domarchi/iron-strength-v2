// Cronómetro de intervalos (spec 012, T255): EMOM y AMRAP calculados con la hora de inicio absoluta,
// de modo que pausar la pantalla o cambiar de app no desajusta el tiempo.
export type IntervalPlan =
  | { mode: "emom"; rounds: number; intervalSeconds: number }
  | { mode: "amrap"; totalSeconds: number };
export type IntervalStatus = {
  done: boolean;
  /** Ronda en curso (1 a N) en EMOM; siempre 1 en AMRAP. */
  round: number;
  rounds: number;
  /** Segundos que quedan de la ronda (EMOM) o del tiempo total (AMRAP). */
  remainingSeconds: number;
  totalRemainingSeconds: number;
};

export const limits = {
  emomRounds: [1, 60],
  emomInterval: [15, 600],
  amrapMinutes: [1, 90],
} as const;

export function planTotalSeconds(plan: IntervalPlan): number {
  return plan.mode === "emom" ? plan.rounds * plan.intervalSeconds : plan.totalSeconds;
}
export function validPlan(plan: IntervalPlan): boolean {
  if (plan.mode === "emom")
    return (
      Number.isInteger(plan.rounds) &&
      plan.rounds >= limits.emomRounds[0] &&
      plan.rounds <= limits.emomRounds[1] &&
      Number.isInteger(plan.intervalSeconds) &&
      plan.intervalSeconds >= limits.emomInterval[0] &&
      plan.intervalSeconds <= limits.emomInterval[1]
    );
  const minutes = plan.totalSeconds / 60;
  return (
    Number.isInteger(minutes) &&
    minutes >= limits.amrapMinutes[0] &&
    minutes <= limits.amrapMinutes[1]
  );
}

/** Estado en `elapsedMs` desde el inicio (el tiempo en pausa ya debe estar descontado). */
export function intervalStatus(plan: IntervalPlan, elapsedMs: number): IntervalStatus {
  const total = planTotalSeconds(plan),
    elapsed = Math.max(0, elapsedMs) / 1000,
    totalRemaining = Math.max(0, total - elapsed);
  if (plan.mode === "amrap")
    return {
      done: totalRemaining <= 0,
      round: 1,
      rounds: 1,
      remainingSeconds: Math.ceil(totalRemaining),
      totalRemainingSeconds: Math.ceil(totalRemaining),
    };
  if (totalRemaining <= 0)
    return {
      done: true,
      round: plan.rounds,
      rounds: plan.rounds,
      remainingSeconds: 0,
      totalRemainingSeconds: 0,
    };
  const round = Math.floor(elapsed / plan.intervalSeconds) + 1,
    inRound = plan.intervalSeconds - (elapsed - (round - 1) * plan.intervalSeconds);
  return {
    done: false,
    round,
    rounds: plan.rounds,
    remainingSeconds: Math.ceil(inRound),
    totalRemainingSeconds: Math.ceil(totalRemaining),
  };
}
/** ¿Cambió la ronda entre dos instantes? Sirve para avisar con vibración. */
export function roundChanged(plan: IntervalPlan, fromMs: number, toMs: number): boolean {
  if (plan.mode !== "emom") return false;
  const a = intervalStatus(plan, fromMs),
    b = intervalStatus(plan, toMs);
  return a.round !== b.round && !a.done;
}
