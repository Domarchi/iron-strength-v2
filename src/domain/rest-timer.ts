// Descanso entre series (RF-27, RF-60; DC-23, DC-24). Todo se calcula desde la hora de término
// (`endsAt`, en ms), no contando ticks: si el móvil bloquea la pantalla o cambia de aplicación,
// al volver el tiempo restante sigue siendo exacto.

export const DEFAULT_REST_SECONDS = 90;
export const WARMUP_REST_SECONDS = 60;
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;
export const REST_STEP_SECONDS = 15;

export type Rest = {
  endsAt: number; // ms desde epoch
  totalSeconds: number; // base de la barra de avance
};

export function startRest(nowMs: number, afterWarmup: boolean): Rest {
  const totalSeconds = afterWarmup ? WARMUP_REST_SECONDS : DEFAULT_REST_SECONDS;
  return { endsAt: nowMs + totalSeconds * 1000, totalSeconds };
}

// La elección del ejercicio solo se aplica al próximo descanso; 0 lo desactiva.
export function restAfterSet(
  nowMs: number,
  afterWarmup: boolean,
  workSeconds = DEFAULT_REST_SECONDS,
): Rest | null {
  if (workSeconds === 0) return null;
  const totalSeconds = afterWarmup ? WARMUP_REST_SECONDS : workSeconds;
  return { endsAt: nowMs + totalSeconds * 1000, totalSeconds };
}

export function remainingSeconds(rest: Rest, nowMs: number): number {
  return Math.max(0, Math.ceil((rest.endsAt - nowMs) / 1000));
}

// Suma o resta segundos al tiempo que queda, dentro de 15 s a 10 min.
export function adjustRest(rest: Rest, nowMs: number, deltaSeconds: number): Rest {
  const next = Math.min(
    MAX_REST_SECONDS,
    Math.max(MIN_REST_SECONDS, remainingSeconds(rest, nowMs) + deltaSeconds),
  );
  return { endsAt: nowMs + next * 1000, totalSeconds: Math.max(rest.totalSeconds, next) };
}

// "1:30". Para el cronómetro de la barra de descanso.
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
