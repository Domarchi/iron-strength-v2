"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  REST_STEP_SECONDS,
  adjustRest,
  formatClock,
  remainingSeconds,
  type Rest,
} from "@/domain/rest-timer";

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
  // Arranca en el instante en que empezó el descanso (dato derivado de `rest`, sin leer el reloj
  // durante el render) y el intervalo lo corrige enseguida.
  const [now, setNow] = useState(rest.endsAt - rest.totalSeconds * 1000);
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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.15)]"
    >
      <div className="h-1 bg-muted" aria-hidden>
        <div
          className="h-full bg-primary transition-[width] duration-200 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2">
        <Timer className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {finished ? "Descanso terminado" : "Descanso"}
          </p>
          <p
            className="text-2xl leading-none font-semibold tabular-nums"
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
          aria-label={`Restar ${REST_STEP_SECONDS} segundos al descanso`}
          onClick={() => onChange(adjustRest(rest, Date.now(), -REST_STEP_SECONDS))}
          disabled={finished}
        >
          <Minus aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Sumar ${REST_STEP_SECONDS} segundos al descanso`}
          onClick={() => onChange(adjustRest(rest, Date.now(), REST_STEP_SECONDS))}
        >
          <Plus aria-hidden />
        </Button>
        <Button type="button" variant={finished ? "default" : "secondary"} onClick={onDismiss}>
          {finished ? "Cerrar" : "Saltar"}
        </Button>
      </div>
    </div>
  );
}
