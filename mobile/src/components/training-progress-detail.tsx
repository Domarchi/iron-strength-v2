import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Text, View } from "react-native";
import Svg, { Line, Polyline, Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  compareTrainingProgress,
  type TrainingComparisonMetric,
} from "../../../src/domain/training-progress";
import { parseProgressWeeks } from "../../../src/domain/progress-period";
import {
  availableTrainingMetrics,
  defaultTrainingMetric,
  formatProgressValue,
  PROGRESS_LABELS,
  progressPointValue,
} from "../lib/training-progress-view";
import { formatPresentedTrainingMetrics } from "../../../src/domain/training-metrics";
import { RECORD_TYPE_LABELS } from "../lib/training-labels";
import { chartCoordinates } from "../lib/progress-view";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { ProgressChoice } from "./progress-choice";
import { Action, Notice, s, day, usePalette } from "./ui";
import { ConnectionStatus } from "./connection-status";
export function TrainingProgressDetail() {
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    { client } = useSession(),
    { preferences } = useTrainingPreferences(),
    params = useLocalSearchParams<{
      id: string;
      weeks?: string;
      metric?: string;
      recordType?: string;
      from?: string;
    }>(),
    request = useCallback(() => client.trainingProgress(), [client]),
    q = useQuery(request),
    [showMarks, setShowMarks] = useState(false),
    [showInfo, setShowInfo] = useState(false);
  const e = q.value?.exercises.find(
      (e) => e.exerciseId === params.id && (e.recordType ?? "legacy") === params.recordType,
    ),
    weeks = parseProgressWeeks(typeof params.weeks === "string" ? params.weeks : undefined),
    options = e ? availableTrainingMetrics(e) : [],
    metric =
      e &&
      typeof params.metric === "string" &&
      options.includes(params.metric as TrainingComparisonMetric)
        ? (params.metric as TrainingComparisonMetric)
        : e
          ? defaultTrainingMetric(e)
          : "workingSets";
  const comparison = e && q.value ? compareTrainingProgress(e, q.value.today, weeks, metric) : null;
  const points =
    comparison?.current.flatMap((point) => {
      const value = progressPointValue(point, metric);
      return value === null ? [] : [{ point, value }];
    }) ?? [];
  const coords = chartCoordinates(points.map((p) => p.value));
  const open = (workoutId: string) => {
    if (e)
      router.push({
        pathname: "/result/[id]",
        params: {
          id: workoutId,
          exercise: e.exerciseId,
          recordType: e.recordType ?? "legacy",
          progressVersion: "2",
          weeks: String(weeks),
          metric,
        },
      });
  };
  const format = (value: number) => formatProgressValue(metric, value, preferences.value);
  const header = (
    <View style={{ gap: 14 }}>
      <ConnectionStatus />
      <Action
        label={params.from === "exercise" ? "Volver a la ficha" : "Volver a mis ejercicios"}
        quiet
        onPress={() =>
          router.canGoBack()
            ? router.back()
            : params.from === "exercise"
              ? router.replace({
                  pathname: "/exercises/[id]",
                  params: { id: params.id, from: "catalog" },
                })
              : router.replace("/progress")
        }
      />
      {q.error ? (
        <>
          <Notice message={q.error} retry={q.retry} />
          {q.value ? (
            <Text style={[s.caption, { color: p.muted }]}>Datos sin actualizar</Text>
          ) : null}
        </>
      ) : null}
      {q.loading && !q.value ? (
        <Text style={[s.body, { color: p.muted }]}>Cargando progreso…</Text>
      ) : null}
      {q.value && !e ? (
        <Notice message="Ese ejercicio y tipo no tienen registros propios disponibles." />
      ) : null}
      {params.weeks !== undefined &&
      (typeof params.weeks !== "string" || !["4", "8", "12"].includes(params.weeks)) ? (
        <Notice message="Periodo no válido. Mostramos 8 semanas." />
      ) : null}
      {e &&
      params.metric !== undefined &&
      (typeof params.metric !== "string" ||
        !options.includes(params.metric as TrainingComparisonMetric)) ? (
        <Notice message="Esa métrica no corresponde a este tipo. Mostramos su métrica principal." />
      ) : null}
      {e && comparison ? (
        <>
          <Text accessibilityRole="header" style={[s.heading, { color: p.ink }]}>
            {e.name}
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>
            {e.recordType === null ? "Registro anterior" : RECORD_TYPE_LABELS[e.recordType]}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {([4, 8, 12] as const).map((n) => (
              <ProgressChoice
                key={n}
                label={`${n} semanas`}
                selected={weeks === n}
                onPress={() => router.setParams({ weeks: String(n) })}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {options.map((m) => (
              <ProgressChoice
                key={m}
                label={PROGRESS_LABELS[m]}
                selected={metric === m}
                onPress={() => router.setParams({ metric: m })}
              />
            ))}
          </View>
          <View style={[s.divider, { borderColor: p.border, gap: 8 }]}>
            <Text style={[s.caption, { color: p.muted }]}>
              {PROGRESS_LABELS[metric]} · {day(comparison.currentStart)}–
              {day(comparison.currentEnd)}
            </Text>
            <Text
              accessibilityLabel="Valor del periodo"
              style={[s.heading, s.number, { color: p.ink }]}
            >
              {comparison.currentValue === null ? "Sin registros" : format(comparison.currentValue)}
            </Text>
            {comparison.changePercent !== null ? (
              <Text
                style={[
                  s.subheading,
                  s.number,
                  {
                    color: (
                      comparison.direction === "lower"
                        ? comparison.changePercent < 0
                        : comparison.changePercent > 0
                    )
                      ? p.success
                      : p.muted,
                  },
                ]}
              >
                {comparison.changePercent > 0 ? "+" : ""}
                {comparison.changePercent.toLocaleString("es-CL", { maximumFractionDigits: 1 })} %
              </Text>
            ) : (
              <Text style={[s.caption, { color: p.muted }]}>
                Sin datos comparables del periodo anterior.
              </Text>
            )}
            <Text style={[s.caption, { color: p.muted }]}>
              Anterior: {day(comparison.previousStart)}–{day(comparison.previousEnd)}
              {comparison.previousValue === null
                ? " · sin registros"
                : ` · ${format(comparison.previousValue)}`}
            </Text>
            {metric === "assistanceKg" ? (
              <Text style={[s.caption, { color: p.muted }]}>
                Menor asistencia · compara también las repeticiones de cada serie.
              </Text>
            ) : null}
          </View>
          {coords.length ? (
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Evolución de ${e.name}: ${coords.length} entrenamientos. Valores y enlaces debajo.`}
            >
              <Svg width="100%" height={170} viewBox="0 0 300 170" aria-hidden>
                {[20, 85, 150].map((y) => (
                  <Line key={y} x1={12} x2={288} y1={y} y2={y} stroke={p.border} strokeWidth={1} />
                ))}
                <Polyline
                  points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
                  stroke={p.blue}
                  strokeWidth={2}
                  fill="none"
                />
                {coords.map((c, i) => (
                  <Circle key={i} cx={c.x} cy={c.y} r={3.5} fill={p.blue} />
                ))}
              </Svg>
            </View>
          ) : (
            <Text style={[s.body, { color: p.muted }]}>No hay registros en este periodo.</Text>
          )}
          <Action label="Marcas históricas" quiet onPress={() => setShowMarks((v) => !v)} />
          {showMarks
            ? e.marks.map((mark) => (
                <View key={mark.metric} style={[s.divider, { borderColor: p.border, gap: 6 }]}>
                  <Text style={[s.caption, { color: p.muted }]}>
                    {PROGRESS_LABELS[mark.metric]}
                  </Text>
                  <Text
                    accessibilityLabel={`Marca histórica de ${PROGRESS_LABELS[mark.metric]}`}
                    style={[s.subheading, s.number, { color: p.ink }]}
                  >
                    {formatProgressValue(mark.metric, mark.value, preferences.value)}
                  </Text>
                  <Text style={[s.caption, { color: p.muted }]}>
                    {formatPresentedTrainingMetrics(mark.metrics, preferences.value)}
                  </Text>
                  <Action
                    label={`Ver marca de ${PROGRESS_LABELS[mark.metric]} del ${day(mark.date)}`}
                    quiet
                    onPress={() => open(mark.workoutId)}
                  />
                </View>
              ))
            : null}
          <Action label="Detalle del cálculo" quiet onPress={() => setShowInfo((v) => !v)} />
          {showInfo ? (
            <Text style={[s.caption, { color: p.muted }]}>
              Valores reales por entrenamiento; calentamientos excluidos. Marcas de cada serie con
              su contexto, separadas por tipo registrado. El 1RM es una estimación Epley solo para
              peso y repeticiones, no una prueba máxima realizada. El volumen cuenta solo carga
              externa × repeticiones; la asistencia, el tiempo y la distancia se mantienen
              separados.
            </Text>
          ) : null}
          <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
            Entrenamientos de origen
          </Text>
        </>
      ) : null}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <FlatList
        testID="progress-detail-list"
        data={[...points].reverse()}
        keyExtractor={(r) => r.point.workoutId}
        renderItem={({ item: { point, value } }) => (
          <View style={[s.divider, { borderColor: p.border, paddingBottom: 16, gap: 6 }]}>
            <View style={s.row}>
              <Text style={[s.caption, { color: p.muted }]}>
                {day(point.date)} · {point.date.slice(0, 4)}
              </Text>
              <Text style={[s.subheading, s.number, { color: p.ink }]}>{format(value)}</Text>
            </View>
            {point.marks.find((m) => m.metric === metric) ? (
              <Text style={[s.caption, { color: p.muted }]}>
                {formatPresentedTrainingMetrics(
                  point.marks.find((m) => m.metric === metric)!.metrics,
                  preferences.value,
                )}
              </Text>
            ) : null}
            {point.records.length ? (
              <Text style={[s.caption, { color: p.blue }]}>
                {point.records.length}{" "}
                {point.records.length === 1 ? "marca mejorada" : "marcas mejoradas"}
              </Text>
            ) : null}
            <Action
              label={`Ver entrenamiento del ${day(point.date)}`}
              quiet
              onPress={() => open(point.workoutId)}
            />
          </View>
        )}
        ListHeaderComponent={header}
        contentContainerStyle={{
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: insets.bottom + 28,
        }}
      />
    </View>
  );
}
