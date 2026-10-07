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
const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function ExerciseProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const [{ exerciseId }, { vista }, user] = await Promise.all([
    params,
    searchParams,
    requireUser(),
  ]);
  const db = await createClient();
  const [list, series] = await Promise.all([
    listExerciseProgress(db, user.id),
    getExerciseSeries(db, user.id, exerciseId),
  ]);

  const summary = list.find((e) => e.exerciseId === exerciseId);
  if (!summary) notFound();

  const metric = summary.isBodyweight ? "reps" : vista === "volumen" ? "volume" : "1rm";
  const chartPoints = series.map((p) => ({
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
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">{summary.name}</h1>
        <p className="text-sm text-muted-foreground">
          {summary.workoutCount} {summary.workoutCount === 1 ? "entrenamiento" : "entrenamientos"}
        </p>
      </header>

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
                ["1rm", "1RM estimado", `/progress/${exerciseId}`],
                ["volume", "Volumen", `/progress/${exerciseId}?vista=volumen`],
              ].map(([key, label, href]) => (
                <Link
                  key={key}
                  href={href}
                  aria-current={metric === key ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                    metric === key
                      ? "border-primary bg-primary/10 text-primary"
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

      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-primary">
          Ver los datos en una tabla
        </summary>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-normal">Fecha</th>
              <th className="py-1 font-normal">
                {summary.isBodyweight ? "Repeticiones" : "1RM estimado"}
              </th>
              <th className="py-1 font-normal">{summary.isBodyweight ? "" : "Volumen"}</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((p) => (
              <tr key={p.workoutId} className="border-t">
                <td className="py-2">{fmtDate(p.date)}</td>
                <td className="py-2 tabular-nums">
                  {summary.isBodyweight ? p.bodyweightReps : formatKg(round1(p.estimated1RM))}
                </td>
                <td className="py-2 tabular-nums">
                  {summary.isBodyweight ? "" : formatKg(p.volumeKg)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <div>
        <Button variant="outline" render={<Link href="/progress" />}>
          Volver
        </Button>
      </div>
    </div>
  );
}
