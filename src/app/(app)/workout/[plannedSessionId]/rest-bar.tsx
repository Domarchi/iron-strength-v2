"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  REST_STEP_SECONDS,
  adjustRest,
  formatClock,
  remainingSeconds,
  type Rest,
} from "@/domain/rest-timer";

const clockNow = () => Date.now();

// Barra fija inferior con el descanso entre series (RF-27). El tiempo restante sale de la hora de
// término, no de contar ticks: sigue exacto tras bloquear la pantalla (RF-27, DC-24).
export function RestBar({
  rest,
  onChange,
  onDismiss,
}: {
  rest: Rest;
  onChange: (next: Rest) => void;
  onDismiss: () => void;
}) {
  // Usa la hora actual al montar: restaurar el borrador no reinicia la cuenta.
  const [now, setNow] = useState(clockNow);
  const vibrated = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const left = remainingSeconds(rest, now);
  const finished = left === 0;
  const progress = finished
    ? 100
    : Math.min(100, ((rest.totalSeconds - left) / rest.totalSeconds) * 100);

  // Avisa una sola vez por descanso (si el dispositivo lo permite).
  useEffect(() => {
    if (!finished || vibrated.current === rest.endsAt) return;
    vibrated.current = rest.endsAt;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // sin vibración: el aviso en pantalla basta
    }
  }, [finished, rest.endsAt]);

  return (
    <div
      role="timer"
      aria-label="Descanso entre series"
      className="rest-dock fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl overflow-hidden rounded-2xl border bg-card pb-[env(safe-area-inset-bottom)] shadow-xl"
    >
      <div className="h-1 bg-muted" aria-hidden>
        <div
          className="h-full bg-primary transition-[width] duration-200 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="rest-dock-content mx-auto grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 px-3 py-3">
        <div className="rest-dock-clock col-start-2 row-start-1 min-w-0 text-center">
          <p className="text-xs text-muted-foreground">
            <Timer className="mr-1 inline size-4" aria-hidden />
            {finished ? "Descanso terminado" : "Descanso"}
          </p>
          <p
            className="mt-1 text-4xl leading-none font-semibold tabular-nums"
            aria-live="off"
            data-testid="rest-clock"
          >
            {finished ? "¡A entrenar!" : formatClock(left)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rest-adjust col-start-1 row-start-1"
          aria-label={`Restar ${REST_STEP_SECONDS} segundos al descanso`}
          onClick={() => onChange(adjustRest(rest, Date.now(), -REST_STEP_SECONDS))}
          disabled={finished}
        >
          <span aria-hidden>−15</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rest-adjust col-start-3 row-start-1"
          aria-label={`Sumar ${REST_STEP_SECONDS} segundos al descanso`}
          onClick={() => onChange(adjustRest(rest, Date.now(), REST_STEP_SECONDS))}
        >
          <span aria-hidden>+15</span>
        </Button>
        <Button
          type="button"
          className="col-span-3 mx-auto h-11 bg-transparent text-muted-foreground"
          variant={finished ? "default" : "secondary"}
          onClick={onDismiss}
        >
          {finished ? "Cerrar" : "Saltar"}
        </Button>
      </div>
    </div>
  );
}
