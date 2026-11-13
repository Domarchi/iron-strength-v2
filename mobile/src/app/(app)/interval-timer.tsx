import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Action, Page, ScreenIntro } from "../../components/ui";
import { Button } from "../../ui/actions";
import { SegmentedControl, Stepper } from "../../ui/controls";
import { Card, ProgressRing } from "../../ui/display";
import { Txt } from "../../ui/text";
import { tap } from "../../lib/haptics";
import { useTrainingKeepAwake } from "../../lib/keep-awake";
import {
  intervalStatus,
  limits,
  planTotalSeconds,
  roundChanged,
  validPlan,
  type IntervalPlan,
} from "../../lib/interval-timer";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** EMOM y AMRAP: el tiempo se calcula con la hora de inicio, así que sigue exacto aunque la app esté en segundo plano. */
export default function IntervalTimer() {
  useTrainingKeepAwake();
  const [mode, setMode] = useState<"emom" | "amrap">("emom"),
    [rounds, setRounds] = useState(10),
    [interval, setIntervalSeconds] = useState(60),
    [minutes, setMinutes] = useState(12);
  const plan: IntervalPlan =
    mode === "emom"
      ? { mode, rounds, intervalSeconds: interval }
      : { mode, totalSeconds: minutes * 60 };
  // Hora de inicio absoluta; `pausedAt` congela el reloj y `shift` descuenta lo pausado.
  const run = useRef<{ startedAt: number; pausedAt: number | null; shift: number } | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null),
    [paused, setPaused] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    if (elapsed === null || paused) return;
    const id = setInterval(() => {
      const r = run.current;
      if (!r) return;
      const now = Date.now() - r.startedAt - r.shift;
      if (roundChanged(plan, last.current, now)) tap("light");
      if (intervalStatus(plan, now).done && !intervalStatus(plan, last.current).done)
        tap("success");
      last.current = now;
      setElapsed(now);
    }, 250);
    return () => clearInterval(id);
    // El plan no cambia mientras corre: sus campos se bloquean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed === null, paused, mode, rounds, interval, minutes]);

  const running = elapsed !== null;
  const status = running ? intervalStatus(plan, elapsed) : null;
  const total = planTotalSeconds(plan);
  const start = () => {
    if (!validPlan(plan)) return;
    run.current = { startedAt: Date.now(), pausedAt: null, shift: 0 };
    last.current = 0;
    setPaused(false);
    setElapsed(0);
    tap("light");
  };
  const togglePause = () => {
    const r = run.current;
    if (!r) return;
    if (paused) {
      r.shift += Date.now() - (r.pausedAt ?? Date.now());
      r.pausedAt = null;
      setPaused(false);
    } else {
      r.pausedAt = Date.now();
      setPaused(true);
    }
  };
  const reset = () => {
    run.current = null;
    setElapsed(null);
    setPaused(false);
  };
  return (
    <Page compact>
      <Action label="Volver a Entrenar" quiet onPress={() => router.navigate("/train")} />
      <ScreenIntro
        title="Cronómetro"
        description="EMOM: una ronda cada intervalo. AMRAP: tantas rondas como puedas en el tiempo."
      />
      {!running ? (
        <View style={{ gap: 16 }}>
          <SegmentedControl
            label="Tipo de cronómetro"
            value={mode}
            onChange={setMode}
            options={[
              { value: "emom", label: "EMOM" },
              { value: "amrap", label: "AMRAP" },
            ]}
          />
          {mode === "emom" ? (
            <>
              <Stepper
                label="Rondas"
                value={rounds}
                min={limits.emomRounds[0]}
                max={limits.emomRounds[1]}
                onChange={setRounds}
              />
              <Stepper
                label="Segundos por ronda"
                unit="s"
                value={interval}
                min={limits.emomInterval[0]}
                max={limits.emomInterval[1]}
                step={15}
                onChange={setIntervalSeconds}
              />
            </>
          ) : (
            <Stepper
              label="Minutos"
              unit="min"
              value={minutes}
              min={limits.amrapMinutes[0]}
              max={limits.amrapMinutes[1]}
              onChange={setMinutes}
            />
          )}
          <Txt muted>Duración total: {clock(total)}</Txt>
          <Button label="Empezar cronómetro" icon="play" onPress={start} />
        </View>
      ) : (
        <Card>
          <View style={{ alignItems: "center", gap: 12 }}>
            {status && !status.done ? (
              <>
                <ProgressRing
                  value={status.remainingSeconds / (mode === "emom" ? interval : total)}
                  size={180}
                  stroke={10}
                  label={`Quedan ${status.remainingSeconds} segundos`}
                >
                  <Txt variant="display" accessibilityLabel="Tiempo restante">
                    {clock(status.remainingSeconds)}
                  </Txt>
                </ProgressRing>
                {mode === "emom" ? (
                  <Txt variant="heading">
                    Ronda {status.round} de {status.rounds}
                  </Txt>
                ) : (
                  <Txt muted>Cuenta tus rondas: tiempo total {clock(total)}</Txt>
                )}
                {paused ? <Txt color="#c4281c">En pausa</Txt> : null}
              </>
            ) : (
              <Txt variant="title" accessibilityRole="header">
                ¡Terminado!
              </Txt>
            )}
          </View>
          <View style={{ gap: 10 }}>
            {status && !status.done ? (
              <Button
                label={paused ? "Reanudar" : "Pausar"}
                role="secondary"
                onPress={togglePause}
              />
            ) : null}
            <Button
              label={status?.done ? "Nuevo cronómetro" : "Detener"}
              role={status?.done ? "primary" : "danger"}
              onPress={reset}
            />
          </View>
        </Card>
      )}
    </Page>
  );
}
