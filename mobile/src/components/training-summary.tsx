import { useMemo, useState } from "react";
import { Text, View, Pressable } from "react-native";
import type { MobileTrainingProgress } from "../../../src/lib/mobile/training-progress-contracts";
import { trainingPeriodSummary } from "../../../src/domain/training-progress";
import { formatProgressValue, queryPeriod } from "../lib/training-progress-view";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { ProgressChoice } from "./progress-choice";
import { PeriodNavigation } from "./period-navigation";
import { Action, s, usePalette } from "./ui";
export function TrainingSummary({
  value,
  anchor,
  mode,
  offset,
  onMode,
  onOffset,
  evidence,
  onEvidence,
}: {
  value: MobileTrainingProgress;
  anchor: string;
  mode: "month" | "year";
  offset: number;
  onMode: (mode: "month" | "year") => void;
  onOffset: (delta: number) => void;
  evidence: string | null;
  onEvidence: (muscle: string | null) => void;
}) {
  const p = usePalette(),
    { preferences } = useTrainingPreferences(),
    [details, setDetails] = useState(false),
    period = queryPeriod(anchor, mode, offset),
    summary = useMemo(
      () => trainingPeriodSummary(value.activity, value.today, period.from, period.to),
      [value, period.from, period.to],
    );
  const stats = [
    {
      label: "Entrenamientos",
      value: String(summary.workoutCount),
      accessibilityLabel: "Entrenamientos del periodo",
    },
    {
      label: "Días activos",
      value: String(summary.activeDays),
      accessibilityLabel: "Días activos del periodo",
    },
    {
      label: "Series",
      value: String(summary.totals.workingSets),
      accessibilityLabel: "Series del periodo",
    },
  ];
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row" }}>
        <ProgressChoice label="Mes" selected={mode === "month"} onPress={() => onMode("month")} />
        <ProgressChoice label="Año" selected={mode === "year"} onPress={() => onMode("year")} />
      </View>
      <PeriodNavigation
        label={period.label}
        onPrevious={() => onOffset(-1)}
        onNext={() => onOffset(1)}
      />
      {summary.observedEnd === null ? (
        <Text style={[s.body, { color: p.muted }]}>Aún no empieza este periodo.</Text>
      ) : (
        <>
          <View style={[s.row, { alignItems: "flex-start" }]}>
            {stats.map((stat) => (
              <View key={stat.label} style={{ minWidth: 80, flex: 1, gap: 3 }}>
                <Text
                  accessibilityLabel={stat.accessibilityLabel}
                  style={[s.heading, s.number, { color: p.ink }]}
                >
                  {stat.value}
                </Text>
                <Text style={[s.caption, { color: p.muted }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
          <View style={[s.divider, { borderColor: p.border, gap: 4 }]}>
            <Text style={[s.caption, { color: p.muted }]}>Regularidad</Text>
            <Text
              accessibilityLabel="Regularidad del periodo"
              style={[s.subheading, s.number, { color: p.ink }]}
            >
              {summary.activeWeeks} de {summary.observedWeeks} semanas
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            {summary.totals.externalVolumeKg > 0 ? (
              <Text style={[s.body, { color: p.ink }]}>
                {formatProgressValue(
                  "externalVolumeKg",
                  summary.totals.externalVolumeKg,
                  preferences.value,
                )}{" "}
                de volumen externo
              </Text>
            ) : null}
            <Text style={[s.body, { color: p.ink }]}>
              {Math.round(summary.durationSeconds / 60)} min de entrenamiento
            </Text>
            {summary.totals.durationSeconds > 0 ? (
              <Text style={[s.body, { color: p.ink }]}>
                {formatProgressValue(
                  "totalDurationSeconds",
                  summary.totals.durationSeconds,
                  preferences.value,
                )}{" "}
                registrados
              </Text>
            ) : null}
            {summary.totals.distanceMeters > 0 ? (
              <Text style={[s.body, { color: p.ink }]}>
                {formatProgressValue(
                  "totalDistanceMeters",
                  summary.totals.distanceMeters,
                  preferences.value,
                )}{" "}
                registrados
              </Text>
            ) : null}
          </View>
          <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
            Distribución muscular
          </Text>
          {!summary.muscles.length ? (
            <Text style={[s.body, { color: p.muted }]}>Sin series de trabajo en este periodo.</Text>
          ) : null}
          {summary.muscles.map((m) => {
            const label = m.muscleGroup ?? "Sin clasificar",
              key = m.muscleGroup ?? "__unknown__";
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Ver entrenamientos de ${label}`}
                accessibilityState={{ selected: evidence === key }}
                aria-pressed={evidence === key}
                onPress={() => onEvidence(evidence === key ? null : key)}
                style={({ pressed }) => ({
                  minHeight: 56,
                  gap: 7,
                  paddingVertical: 8,
                  backgroundColor: pressed ? p.raised : "transparent",
                })}
              >
                <View style={s.row}>
                  <Text style={[s.body, { color: evidence === key ? p.blue : p.ink }]}>
                    {label}
                  </Text>
                  <Text style={[s.caption, s.number, { color: p.muted }]}>
                    {m.workingSets} series
                  </Text>
                </View>
                <View
                  accessible={false}
                  style={{ height: 4, borderRadius: 2, backgroundColor: p.raised }}
                >
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      width: `${(m.workingSets / summary.totals.workingSets) * 100}%`,
                      backgroundColor: p.blue,
                    }}
                  />
                </View>
              </Pressable>
            );
          })}
          <Action label="Cómo se calcula" quiet onPress={() => setDetails((v) => !v)} />
          {details ? (
            <Text style={[s.caption, { color: p.muted }]}>
              Series de trabajo, sin calentamientos. Músculos según el catálogo visible actual; lo
              demás queda sin clasificar. La regularidad cuenta semanas de lunes a domingo
              observadas hasta hoy en Santiago. No equivale al cumplimiento del programa. El volumen
              suma carga externa × repeticiones; no convierte asistencia, tiempo o distancia.
            </Text>
          ) : null}
        </>
      )}
      <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
        {evidence
          ? `Entrenamientos · ${evidence === "__unknown__" ? "Sin clasificar" : evidence}`
          : "Entrenamientos del periodo"}
      </Text>
      {evidence ? (
        <Action label="Ver todos los músculos" quiet onPress={() => onEvidence(null)} />
      ) : null}
    </View>
  );
}
