import { PageHeading } from "@/components/layout/page-heading";
import Link from "next/link";
import { Suspense } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@/components/charts/line-chart";
import { santiagoDate } from "@/domain/dates";
import { requireUser } from "@/lib/auth/session";
import { listMeasurements, type Measurement } from "@/lib/data/measurements";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { deleteMeasurementAction } from "./actions";
import { MeasurementForm } from "./measurement-form";
import { PhotoGallery } from "./photo-gallery";
import { PhotoUploader } from "./photo-uploader";

export const metadata = { title: "Cuerpo · Iron Strength" };

const METRICS = {
  peso: { label: "Peso", unit: "kg", pick: (m: Measurement) => m.weightKg },
  cintura: { label: "Cintura", unit: "cm", pick: (m: Measurement) => m.waistCm },
  pecho: { label: "Pecho", unit: "cm", pick: (m: Measurement) => m.chestCm },
  brazo: { label: "Brazo", unit: "cm", pick: (m: Measurement) => m.armCm },
} as const;
type MetricKey = keyof typeof METRICS;

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmtN = (n: number | null) => (n === null ? "—" : String(n).replace(".", ","));

type SearchParams = Promise<{ medida?: string; alumno?: string }>;

async function Measurements({
  searchParams,
  readOnly,
}: {
  searchParams: SearchParams;
  readOnly: boolean;
}) {
  const [{ medida, alumno }, user] = await Promise.all([searchParams, requireUser()]);
  const studentId = user.role === "coach" && alumno ? alumno : user.id;
  const list = await listMeasurements(await createClient(), studentId);

  const key: MetricKey = medida && medida in METRICS ? (medida as MetricKey) : "peso";
  const metric = METRICS[key];
  const points = [...list].reverse().flatMap((m) => {
    const y = metric.pick(m);
    return y === null ? [] : [{ x: m.measuredOn, y }];
  });
  const suffix = alumno ? `&alumno=${alumno}` : "";

  return (
    <>
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Evolución</CardTitle>
          <nav aria-label="Qué medida mostrar" className="flex flex-wrap gap-2">
            {(Object.keys(METRICS) as MetricKey[]).map((k) => (
              <Link
                key={k}
                href={`/body?medida=${k}${suffix}`}
                aria-current={k === key ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                  k === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {METRICS[k].label}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent>
          <LineChart
            points={points}
            label={metric.label}
            formatY={(y) => `${fmtN(y)} ${metric.unit}`}
            formatX={(x) => shortDate.format(new Date(`${x}T00:00:00Z`))}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-lg font-medium">
          Registros
        </h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "Todavía no hay medidas registradas."
              : "Aún no registras medidas. Empieza con el formulario de arriba."}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {list.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {dateFormat.format(new Date(`${m.measuredOn}T00:00:00Z`))}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Peso {fmtN(m.weightKg)} kg · Cintura {fmtN(m.waistCm)} · Pecho {fmtN(m.chestCm)}{" "}
                    · Brazo {fmtN(m.armCm)}
                  </p>
                </div>
                {readOnly ? null : (
                  <form action={deleteMeasurementAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      aria-label={`Borrar el registro del ${dateFormat.format(new Date(`${m.measuredOn}T00:00:00Z`))}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default async function BodyPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ alumno }, user] = await Promise.all([searchParams, requireUser()]);
  const readOnly = user.role === "coach" && Boolean(alumno);

  return (
    <div className="flex flex-col gap-6">
      <header>
        {readOnly ? (
          <Link href={`/coach/students/${alumno}`} className="text-sm text-primary">
            ← Volver al alumno
          </Link>
        ) : null}
        <PageHeading
          title={readOnly ? "Medidas del alumno" : "Cuerpo"}
          eyebrow="Más allá de las marcas"
          description="Registra tus medidas y observa los cambios a tu ritmo."
        />
      </header>

      {readOnly ? null : (
        <section aria-labelledby="new-heading" className="flex flex-col gap-3">
          <h2 id="new-heading" className="text-lg font-medium">
            Registrar medidas
          </h2>
          <MeasurementForm today={santiagoDate(new Date())} />
        </section>
      )}

      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <Measurements searchParams={searchParams} readOnly={readOnly} />
      </Suspense>

      <section aria-labelledby="photos-heading" className="flex flex-col gap-3">
        <h2 id="photos-heading" className="text-lg font-medium">
          Fotos de progreso
        </h2>
        {readOnly ? null : <PhotoUploader userId={user.id} today={santiagoDate(new Date())} />}
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando fotos…</p>}>
          <PhotoGallery studentId={readOnly ? String(alumno) : user.id} readOnly={readOnly} />
        </Suspense>
      </section>
    </div>
  );
}
