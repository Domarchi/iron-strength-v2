import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import {
  compareProgressPeriods,
  type ProgressMetric,
  type ProgressWeeks,
} from "../../../src/domain/progress-period";
import type { MobileProgressDetail } from "../../../src/lib/mobile/contracts";
import { chartCoordinates } from "../lib/progress-view";
import { Action, Notice, day, s, usePalette } from "./ui";
const number = (value: number) => value.toLocaleString("es-CL", { maximumFractionDigits: 1 });
function Choice({
  label,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={onPress}
      style={{
        minHeight: 48,
        paddingHorizontal: compact ? 8 : 14,
        paddingVertical: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: selected ? p.blue : p.border,
        backgroundColor: selected ? p.tint : p.card,
        justifyContent: "center",
      }}
    >
      <Text style={[s.label, { color: selected ? p.blue : p.ink }]}>{label}</Text>
    </Pressable>
  );
}
export function ProgressDetail({
  value,
  weeks,
  metric,
  onWeeks,
  onMetric,
}: {
  value: MobileProgressDetail;
  weeks: ProgressWeeks;
  metric: ProgressMetric;
  onWeeks: (weeks: ProgressWeeks) => void;
  onMetric: (metric: ProgressMetric) => void;
}) {
  const p = usePalette(),
    e = value.exercise,
    comparison = compareProgressPeriods(value.points, value.today, weeks, metric),
    unit = metric === "reps" ? "reps" : "kg";
  const pointValue = (point: MobileProgressDetail["points"][number]) =>
    metric === "1rm"
      ? point.estimated1RM
      : metric === "volume"
        ? point.volumeKg
        : point.bodyweightReps;
  const values = comparison.current.map(pointValue),
    coords = chartCoordinates(values);
  return (
    <>
      <Text accessibilityRole="header" style={[s.heading, { color: p.ink }]}>
        {e.name}
      </Text>
      <Text style={[s.body, { color: p.muted }]}>
        {e.isBodyweight
          ? `Mejor serie histórica: ${number(e.bestReps)} reps`
          : `Mejor peso histórico: ${number(e.bestWeightKg)} kg`}
      </Text>
      <View style={[s.row, { justifyContent: "flex-start", gap: 8 }]}>
        {([4, 8, 12] as const).map((n) => (
          <Choice
            key={n}
            compact
            label={`${n} semanas`}
            selected={weeks === n}
            onPress={() => onWeeks(n)}
          />
        ))}
      </View>
      {e.isBodyweight ? (
        <Text style={[s.caption, { color: p.blue }]}>REPETICIONES SIN CARGA</Text>
      ) : (
        <View style={[s.row, { justifyContent: "flex-start" }]}>
          <Choice
            label="1RM estimado"
            selected={metric === "1rm"}
            onPress={() => onMetric("1rm")}
          />
          <Choice
            label="Volumen"
            selected={metric === "volume"}
            onPress={() => onMetric("volume")}
          />
        </View>
      )}
      <Text style={[s.caption, { color: p.muted }]}>
        {day(comparison.currentStart)} – {day(comparison.currentEnd)} · Santiago
      </Text>
      <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
        <Text style={[s.caption, { color: p.muted }]}>
          {metric === "1rm"
            ? "MEJOR 1RM ESTIMADO DEL PERIODO"
            : metric === "volume"
              ? "VOLUMEN TOTAL DEL PERIODO"
              : "REPETICIONES DEL PERIODO"}
        </Text>
        <Text style={[s.heading, s.number, { color: p.ink }]}>
          {comparison.currentValue === null
            ? "Sin registros"
            : `${number(comparison.currentValue)} ${unit}`}
        </Text>
        {comparison.changePercent !== null ? (
          <Text style={[s.subheading, s.number, { color: p.blue }]}>
            {comparison.changePercent > 0 ? "+" : ""}
            {number(comparison.changePercent)} %
          </Text>
        ) : (
          <Text style={[s.body, { color: p.muted }]}>
            Sin datos comparables del periodo anterior.
          </Text>
        )}
        <Text style={[s.caption, { color: p.muted }]}>
          Anterior: {day(comparison.previousStart)} – {day(comparison.previousEnd)}
          {comparison.previousValue === null
            ? " · sin registros"
            : ` · ${number(comparison.previousValue)} ${unit}`}
        </Text>
      </View>
      {coords.length ? (
        <View style={{ gap: 10 }}>
          <View style={s.row}>
            <Text style={[s.caption, { color: p.muted }]}>Por entrenamiento</Text>
            <Text style={[s.caption, s.number, { color: p.ink }]}>
              {number(Math.min(...values))}–{number(Math.max(...values))} {unit}
            </Text>
          </View>
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
                strokeWidth={2.5}
                fill="none"
              />
              {coords.map((c, i) => (
                <Circle key={i} cx={c.x} cy={c.y} r={3.5} fill={p.blue} />
              ))}
            </Svg>
          </View>
          <Text style={[s.caption, { color: p.muted }]}>
            Cada punto representa un entrenamiento, en orden de fecha. Los valores completos están
            debajo.
          </Text>
        </View>
      ) : (
        <Notice message="No hay registros en este periodo." />
      )}
      <Text style={[s.body, { color: p.muted }]}>
        {metric === "1rm"
          ? "Estimación calculada desde tu mejor serie de trabajo; no es una prueba máxima realizada."
          : metric === "volume"
            ? "Suma de peso × repeticiones en series de trabajo. Las repeticiones sin carga se cuentan aparte."
            : "Suma de repeticiones sin carga en series de trabajo."}{" "}
        Los calentamientos no cuentan.
      </Text>
      {comparison.current.length ? (
        <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
          Entrenamientos de origen
        </Text>
      ) : null}
      {[...comparison.current].reverse().map((point) => (
        <View key={point.workoutId + point.date} style={[s.divider, { borderColor: p.border }]}>
          <View style={s.row}>
            <Text style={[s.body, { color: p.ink }]}>{day(point.date)}</Text>
            <Text style={[s.subheading, s.number, { color: p.ink }]}>
              {number(pointValue(point))} {unit}
            </Text>
          </View>
          <Action
            label={`Ver entrenamiento del ${day(point.date)}`}
            quiet
            onPress={() =>
              router.push({
                pathname: "/result/[id]",
                params: {
                  id: point.workoutId,
                  exercise: e.exerciseId,
                  weeks: String(weeks),
                  metric,
                },
              })
            }
          />
        </View>
      ))}
    </>
  );
}
