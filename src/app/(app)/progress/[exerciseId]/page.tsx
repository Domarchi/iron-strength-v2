import type { ProgressPoint } from "@/domain/volume";
import { z } from "zod";
import { santiagoDate } from "@/domain/dates";
import { compareProgressPeriods, parseProgressWeeks } from "@/domain/progress-period";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@/components/charts/line-chart";
import { formatKg } from "@/domain/format";
import { requireUser } from "@/lib/auth/session";
import { getExerciseSeries, listExerciseProgress } from "@/lib/data/progress";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Progreso del ejercicio · Iron Strength" };

const shortDate = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmtDate = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`));
const fullDate = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const fmtPeriodDate = (date: string) => fullDate.format(new Date(`${date}T00:00:00Z`));
const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function ExerciseProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ vista?: string; alumno?: string; semanas?: string }>;
}) {
  const [{ exerciseId }, { vista, alumno: requestedStudent, semanas }, user] = await Promise.all([
    params,
    searchParams,
    requireUser(),
  ]);
  // El coach puede ver el progreso de sus alumnos (la RLS decide si el alumno es suyo).
  const alumno = user.role === "coach" ? requestedStudent : undefined;
  const studentId = alumno ?? user.id;
  if (!z.uuid().safeParse(exerciseId).success || !z.uuid().safeParse(studentId).success) notFound();
  const db = await createClient();
  const [list, series] = await Promise.all([
    listExerciseProgress(db, studentId),
    getExerciseSeries(db, studentId, exerciseId),
  ]);

  const summary = list.find((e) => e.exerciseId === exerciseId);
  if (!summary) notFound();

  const metric = summary.isBodyweight ? "reps" : vista === "volumen" ? "volume" : "1rm";
  const weeks = parseProgressWeeks(semanas);
  const comparison = compareProgressPeriods(series, santiagoDate(new Date()), weeks, metric);
  const periodHref = (period: number, selectedMetric = metric) => {
    const query = new URLSearchParams({
      semanas: String(period),
      vista: selectedMetric === "volume" ? "volumen" : "1rm",
    });
    if (alumno) query.set("alumno", alumno);
    return `/progress/${exerciseId}?${query}`;
  };
  const chartPoints = comparison.current.map((p) => ({
    x: p.date,
    y:
      metric === "reps"
        ? p.bodyweightReps
        : metric === "volume"
          ? p.volumeKg
          : round1(p.estimated1RM),
  }));
  const formatY = (y: number) => (metric === "reps" ? `${y} rep.` : formatKg(y));

  return (
    <div className="flow-page flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">{summary.name}</h1>
        <p className="text-sm text-muted-foreground">
          Historial completo · {summary.workoutCount}{" "}
          {summary.workoutCount === 1 ? "entrenamiento" : "entrenamientos"}
        </p>
      </header>

      <p className="text-xs font-medium text-muted-foreground">Marcas históricas</p>
      <dl className="grid grid-cols-2 gap-3">
        {(summary.isBodyweight
          ? [["Mejor serie", `${summary.bestReps} repeticiones`]]
          : [
              ["Mayor peso", formatKg(summary.bestWeightKg)],
              ["Mejor 1RM estimado", formatKg(round1(summary.bestEstimated1RM))],
            ]
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Periodo de progreso" className="flex flex-wrap gap-2">
        {[4, 8, 12].map((period) => (
          <Link
            key={period}
            href={periodHref(period)}
            aria-current={weeks === period ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
              weeks === period
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {period} semanas
          </Link>
        ))}
      </nav>
      <section aria-label="Comparación de periodos" className="rounded-lg border p-4">
        <h2 className="font-semibold">
          {metric === "1rm"
            ? "Mejor 1RM estimado"
            : metric === "volume"
              ? "Volumen total"
              : "Repeticiones totales"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Dos periodos consecutivos de {comparison.days} días.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">
              Actual · {fmtPeriodDate(comparison.currentStart)} —{" "}
              {fmtPeriodDate(comparison.currentEnd)}
            </dt>
            <dd className="text-lg font-semibold">
              {comparison.currentValue == null
                ? "Sin datos"
                : formatY(round1(comparison.currentValue))}
            </dd>
            <dd className="text-xs text-muted-foreground">
              {comparison.current.length} entrenamientos
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Anterior · {fmtPeriodDate(comparison.previousStart)} —{" "}
              {fmtPeriodDate(comparison.previousEnd)}
            </dt>
            <dd className="text-lg font-semibold">
              {comparison.previousValue == null
                ? "Sin datos"
                : formatY(round1(comparison.previousValue))}
            </dd>
            <dd className="text-xs text-muted-foreground">
              {comparison.previous.length} entrenamientos
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Variación</dt>
            <dd className="text-lg font-semibold">
              {comparison.changePercent == null
                ? "Sin datos comparables"
                : `${comparison.changePercent > 0 ? "+" : ""}${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(comparison.changePercent)} %`}
            </dd>
          </div>
        </dl>
      </section>
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">
            {metric === "reps"
              ? "Repeticiones por entrenamiento"
              : metric === "volume"
                ? "Volumen por entrenamiento"
                : "1RM estimado por entrenamiento"}
          </CardTitle>
          {summary.isBodyweight ? null : (
            <nav aria-label="Qué mostrar" className="flex gap-2">
              {[
                ["1rm", "1RM estimado", periodHref(weeks, "1rm")],
                ["volume", "Volumen", periodHref(weeks, "volume")],
              ].map(([key, label, href]) => (
                <Link
                  key={key}
                  href={href}
                  aria-current={metric === key ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                    metric === key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </CardHeader>
        <CardContent>
          <LineChart
            points={chartPoints}
            label={summary.name}
            formatY={formatY}
            formatX={fmtDate}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="progress-results-heading">
        <h2 id="progress-results-heading" className="mb-2 font-semibold">
          Entrenamientos del periodo
        </h2>
        {!comparison.current.length ? (
          <p className="text-sm text-muted-foreground">
            No hay entrenamientos en estas {weeks} semanas.
          </p>
        ) : null}
        {comparison.current.length ? (
          <ResultsTable points={comparison.current} bodyweight={summary.isBodyweight} />
        ) : null}
      </section>

      {comparison.previous.length ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary">
            Ver entrenamientos del periodo anterior
          </summary>
          <ResultsTable points={comparison.previous} bodyweight={summary.isBodyweight} />
        </details>
      ) : null}
      <div>
        <Button
          variant="outline"
          render={<Link href={alumno ? `/coach/students/${alumno}` : "/progress"} />}
        >
          Volver
        </Button>
      </div>
    </div>
  );
}

function ResultsTable({ points, bodyweight }: { points: ProgressPoint[]; bodyweight: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1 font-normal">Fecha</th>
          <th className="py-1 font-normal">{bodyweight ? "Repeticiones" : "1RM estimado"}</th>
          {!bodyweight ? <th className="py-1 font-normal">Volumen</th> : null}
        </tr>
      </thead>
      <tbody>
        {[...points].reverse().map((p) => (
          <tr key={p.workoutId} className="border-t">
            <td>
              <Link
                href={`/history/${p.workoutId}`}
                aria-label={`Ver entrenamiento del ${p.date}`}
                className="inline-flex min-h-11 min-w-11 items-center text-primary underline underline-offset-4"
              >
                {fmtDate(p.date)}
              </Link>
            </td>
            <td className="py-2 tabular-nums">
              {bodyweight ? p.bodyweightReps : formatKg(round1(p.estimated1RM))}
            </td>
            {!bodyweight ? <td className="py-2 tabular-nums">{formatKg(p.volumeKg)}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
