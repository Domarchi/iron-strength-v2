import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@/components/charts/line-chart";
import { StatusMessage } from "@/components/ui/status-message";
import {
  compareTrainingProgress,
  type TrainingProgressPoint,
  type TrainingComparisonMetric,
} from "@/domain/training-progress";
import { formatTrainingMetrics } from "@/domain/training-metrics";
import { RECORD_TYPE_LABELS } from "../../../mobile/src/lib/training-labels";
import { TrainingProgressControls } from "./controls";
import {
  availableTrainingMetrics,
  PROGRESS_LABELS,
  progressPointValue,
  formatProgressValue,
} from "@/domain/training-progress-view";
import { workoutHref, type TrainingNavigation } from "@/lib/navigation/training-context";
import type { TrainingExerciseSelection } from "@/lib/navigation/training-progress-selection";
const shortDate = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }),
  fullDate = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const fmt = (d: string) => shortDate.format(new Date(`${d}T00:00:00Z`)),
  fmtPeriod = (d: string) => fullDate.format(new Date(`${d}T00:00:00Z`));
const periodTime = new Intl.DateTimeFormat("es-CL", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});
type Selection = Extract<TrainingExerciseSelection, { kind: "ready" }>;
export function TrainingExerciseDetail({
  selection,
  navigation,
  studentId,
  today,
  ownerId,
}: {
  selection: Selection;
  navigation: TrainingNavigation;
  studentId?: string;
  today: string;
  ownerId: string;
}) {
  const { exercise: e, metric, weeks, notices } = selection,
    comparison = compareTrainingProgress(e, today, weeks, metric),
    options = availableTrainingMetrics(e),
    format = (n: number) => formatProgressValue(metric, n),
    kind = e.recordType ?? "legacy";
  const evidence = (workoutId: string, chosen = metric) =>
    workoutHref(
      workoutId,
      { ...navigation, recordType: kind, metric: chosen },
      studentId,
      e.exerciseId,
    );
  const points = comparison.current.flatMap((p) => {
    const value = progressPointValue(p, metric);
    return value === null ? [] : [{ x: p.date, y: value }];
  });
  return (
    <div className="flow-page flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold wrap-anywhere">{e.name}</h1>
        <p className="text-sm text-muted-foreground">
          {e.recordType === null ? "Registro anterior" : RECORD_TYPE_LABELS[e.recordType]} ·{" "}
          {e.workoutCount} {e.workoutCount === 1 ? "entrenamiento" : "entrenamientos"}
        </p>
      </header>
      {notices.length ? <StatusMessage>{notices.join(" ")}</StatusMessage> : null}
      <TrainingProgressControls
        key={`${ownerId}:${e.exerciseId}:${kind}`}
        exerciseId={e.exerciseId}
        navigation={{ ...navigation, recordType: kind }}
        studentId={studentId}
        weeks={weeks}
        metric={metric}
        options={options}
      >
        <section aria-label="Comparación de periodos" className="rounded-lg border p-4">
          <h2 className="font-semibold">{PROGRESS_LABELS[metric]}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">
                Actual · {fmtPeriod(comparison.currentStart)} — {fmtPeriod(comparison.currentEnd)}
              </dt>
              <dd className="text-lg font-semibold tabular-nums wrap-anywhere">
                {comparison.currentValue === null ? "Sin datos" : format(comparison.currentValue)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {comparison.current.length}{" "}
                {comparison.current.length === 1 ? "entrenamiento" : "entrenamientos"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Anterior · {fmtPeriod(comparison.previousStart)} —{" "}
                {fmtPeriod(comparison.previousEnd)}
              </dt>
              <dd className="text-lg font-semibold tabular-nums wrap-anywhere">
                {comparison.previousValue === null ? "Sin datos" : format(comparison.previousValue)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {comparison.previous.length}{" "}
                {comparison.previous.length === 1 ? "entrenamiento" : "entrenamientos"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Variación</dt>
              <dd className="font-semibold tabular-nums">
                {comparison.changePercent === null
                  ? "Sin datos comparables"
                  : `${comparison.changePercent > 0 ? "+" : ""}${comparison.changePercent.toLocaleString("es-CL", { maximumFractionDigits: 1 })} %`}
              </dd>
            </div>
          </dl>
          {metric === "assistanceKg" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Menor asistencia · compara las repeticiones.
            </p>
          ) : null}
        </section>
        {points.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {PROGRESS_LABELS[metric]} por entrenamiento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                points={points}
                label={`${e.name} · ${PROGRESS_LABELS[metric]}`}
                formatY={format}
                formatX={fmt}
              />
            </CardContent>
          </Card>
        ) : null}
        <section aria-labelledby="progress-results-heading">
          <h2 id="progress-results-heading" className="mb-2 font-semibold">
            Entrenamientos del periodo
          </h2>
          {comparison.current.length ? (
            <TrainingResults
              points={comparison.current}
              metric={metric}
              evidenceHref={(id) => evidence(id)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay entrenamientos en estas {weeks} semanas.
            </p>
          )}
        </section>
        {comparison.previous.length ? (
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary">
              Ver entrenamientos del periodo anterior
            </summary>
            <TrainingResults
              points={comparison.previous}
              metric={metric}
              evidenceHref={(id) => evidence(id)}
            />
          </details>
        ) : null}
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary">
            Marcas históricas
          </summary>
          <dl className="grid gap-3 sm:grid-cols-2">
            {e.marks.map((mark) => (
              <div key={mark.metric} className="min-w-0 rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{PROGRESS_LABELS[mark.metric]}</dt>
                <dd className="text-lg font-semibold tabular-nums wrap-anywhere">
                  {formatProgressValue(mark.metric, mark.value)}
                </dd>
                <dd className="text-sm text-muted-foreground wrap-anywhere">
                  {formatTrainingMetrics(mark.metrics)}
                </dd>
                <dd>
                  <Link
                    href={evidence(mark.workoutId, mark.metric)}
                    className="inline-flex min-h-11 min-w-11 items-center text-sm text-primary underline underline-offset-4"
                    aria-label={`Ver marca histórica de ${PROGRESS_LABELS[mark.metric]} del ${mark.date}`}
                  >
                    {fmt(mark.date)}
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary">
            Detalle del cálculo
          </summary>
          <p className="text-sm text-muted-foreground">
            Series de trabajo, separadas por tipo registrado. Las marcas históricas conservan el
            contexto de su serie. El 1RM usa Epley únicamente para peso y repeticiones con carga
            positiva; es una estimación. Volumen externo, asistencia, tiempo y distancia se calculan
            por separado.
          </p>
        </details>
      </TrainingProgressControls>
    </div>
  );
}
function TrainingResults({
  points,
  metric,
  evidenceHref,
}: {
  points: TrainingProgressPoint[];
  metric: TrainingComparisonMetric;
  evidenceHref: (id: string) => string;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1 font-normal">Fecha</th>
          <th className="py-1 font-normal">{PROGRESS_LABELS[metric]}</th>
        </tr>
      </thead>
      <tbody>
        {points.toReversed().map((p) => {
          const value = progressPointValue(p, metric),
            mark = p.marks.find((m) => m.metric === metric);
          return (
            <tr key={p.workoutId} className="border-t">
              <td className="pr-3">
                <Link
                  href={evidenceHref(p.workoutId)}
                  aria-label={`Ver entrenamiento del ${p.date}`}
                  className="inline-flex min-h-11 min-w-11 flex-col justify-center text-primary underline underline-offset-4"
                >
                  <time dateTime={p.startedAt}>{fmt(p.date)}</time>
                  <span className="text-xs text-muted-foreground">
                    {periodTime.format(new Date(p.startedAt))}
                  </span>
                </Link>
              </td>
              <td className="py-2 tabular-nums wrap-anywhere">
                {value === null ? "—" : formatProgressValue(metric, value)}
                {metric === "assistanceKg" && mark ? (
                  <span className="block text-xs text-muted-foreground">
                    {formatTrainingMetrics(mark.metrics)}
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
