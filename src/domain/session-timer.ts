// El inicio real y el descanso absoluto son independientes de la pausa de duración.
// Mantener milisegundos acumulados evita perder fracciones en varias pausas cortas.
export type SessionPause = Readonly<{
  version: 1;
  pausedAtMs: number | null;
  pausedMilliseconds: number;
}>;

export function elapsedSessionSeconds(
  startedAtMs: number,
  nowMs: number,
  pause: SessionPause | null,
): number {
  const elapsed = (pause?.pausedAtMs ?? nowMs) - startedAtMs - (pause?.pausedMilliseconds ?? 0);
  return Math.max(0, Math.floor(elapsed / 1000));
}

export function pauseSession(pause: SessionPause | null, nowMs: number): SessionPause {
  if (pause?.pausedAtMs != null) return pause;
  return {
    version: 1,
    pausedAtMs: nowMs,
    pausedMilliseconds: pause?.pausedMilliseconds ?? 0,
  };
}

export function resumeSession(pause: SessionPause | null, nowMs: number): SessionPause | null {
  if (!pause || pause.pausedAtMs === null) return pause;
  if (nowMs < pause.pausedAtMs)
    throw Error("Revisa la hora del dispositivo antes de reanudar. La pausa se conserva.");
  return {
    version: 1,
    pausedAtMs: null,
    pausedMilliseconds: pause.pausedMilliseconds + nowMs - pause.pausedAtMs,
  };
}
