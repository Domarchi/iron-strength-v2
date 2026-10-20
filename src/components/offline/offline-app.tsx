"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { RunnerLoader } from "@/app/(app)/workout/[plannedSessionId]/runner-loader";
import { SyncWorkouts } from "@/components/offline/sync-workouts";
import { Button } from "@/components/ui/button";
import { listWeekPackages } from "@/lib/offline/storage";
import { canStartDownloadedSession, type WeekPackage } from "@/lib/offline/package";
import { activeOfflineAccount, subscribeOfflineAccount } from "@/lib/offline/account";
import { listDrafts, type WorkoutDraft } from "@/lib/workout/draft";
import { santiagoDate } from "@/domain/dates";
const currentDay = () => santiagoDate(new Date());
function draftsFor(userId: string) {
  try {
    return listDrafts(localStorage, userId);
  } catch {
    return [];
  }
}
function chosenSession() {
  return new URL(window.location.href).searchParams.get("session");
}
export function OfflineApp() {
  const userId = useSyncExternalStore(subscribeOfflineAccount, activeOfflineAccount, () => null);
  if (!userId)
    return (
      <div className="py-8 space-y-4">
        <h1 className="text-2xl font-semibold">Entrenamiento sin conexión</h1>
        <p>Entra con conexión y descarga una semana para usarla aquí.</p>
        <Button render={<a href="/login" />}>Entrar</Button>
      </div>
    );
  return <AccountWeeks key={userId} userId={userId} />;
}
function AccountWeeks({ userId }: { userId: string }) {
  const [packs, setPacks] = useState<WeekPackage[] | null>(null);
  const [drafts, setDrafts] = useState<WorkoutDraft[]>([]);
  const [selected, setSelected] = useState<string | null>(() => chosenSession());
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    listWeekPackages(userId)
      .then((values) => {
        if (active) {
          setPacks(values);
          setDrafts(draftsFor(userId));
          setError(null);
        }
      })
      .catch(() => {
        if (active)
          setError("No se pudieron leer las semanas guardadas. Tus datos se conservan; reintenta.");
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);
  const pack = packs?.find((p) => p.sessions.some((s) => s.context.session.id === selected));
  const session = pack?.sessions.find((s) => s.context.session.id === selected);
  const hasDraft = drafts.some((d) => d.plannedSessionId === selected);
  if (
    pack &&
    session &&
    (hasDraft || canStartDownloadedSession(pack, session.context.session.id, currentDay()))
  )
    return (
      <RunnerLoader
        key={session.context.session.id}
        userId={userId}
        context={session.context}
        recoveryOnly={!canStartDownloadedSession(pack, session.context.session.id, currentDay())}
        downloadedHistory={pack.history}
        localMode
      />
    );
  function start(id: string, owner: WeekPackage) {
    const found = draftsFor(userId).some((d) => d.plannedSessionId === id);
    if (!found && !canStartDownloadedSession(owner, id, currentDay())) {
      setError(
        "Esta descarga ya no corresponde a la semana vigente. Conéctate para descargar la actual.",
      );
      return;
    }
    history.replaceState(null, "", `/offline?session=${encodeURIComponent(id)}`);
    setSelected(id);
  }
  return (
    <div className="py-6 flex flex-col gap-4">
      <SyncWorkouts userId={userId} localMode />
      <header>
        <p className="text-sm text-muted-foreground">Iron Strength · En este dispositivo</p>
        <h1 className="text-2xl font-semibold">Tus semanas descargadas</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        Puedes entrenar sin Internet. Los datos corresponden a la fecha de descarga.
      </p>
      {error && (
        <div role="alert" className="space-y-2">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setAttempt((v) => v + 1)}>
            Reintentar lectura
          </Button>
        </div>
      )}
      {packs === null && !error && <p role="status">Leyendo semanas guardadas…</p>}
      {packs?.length === 0 && (
        <p>
          No tienes semanas descargadas en esta cuenta. Conéctate y descarga una desde Mi semana.
        </p>
      )}
      {packs?.map((p) => (
        <section
          key={`${p.program.id}:${p.weekStart}`}
          className="rounded-xl border bg-card p-4 space-y-3"
          aria-label={`${p.program.name}, semana ${p.weekNumber}`}
        >
          <h2 className="font-semibold wrap-anywhere">
            {p.program.name} · Semana {p.weekNumber}
          </h2>
          <p className="text-xs text-muted-foreground">
            Descargada:{" "}
            {new Intl.DateTimeFormat("es-CL", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "America/Santiago",
            }).format(new Date(p.downloadedAt))}
          </p>
          {p.sessions.length === 0 && <p>Semana de descarga: no hay sesiones previstas.</p>}
          {p.sessions.map((s) => {
            const draft = drafts.find((d) => d.plannedSessionId === s.context.session.id);
            const available = canStartDownloadedSession(p, s.context.session.id, currentDay());
            return (
              <div key={s.context.session.id} className="border-t pt-3 flex flex-col gap-2">
                <p className="font-medium wrap-anywhere">
                  Sesión {s.context.session.label}
                  {s.context.session.title ? ` · ${s.context.session.title}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {s.context.exercises.map((e) => e.name).join(" · ")}
                </p>
                <Button
                  className="self-start"
                  variant="outline"
                  disabled={!available && !draft}
                  onClick={() => start(s.context.session.id, p)}
                >
                  {draft ? "Retomar" : "Iniciar"} sesión {s.context.session.label}
                </Button>
                {!available && !draft && (
                  <p className="text-xs text-muted-foreground">
                    Solo se puede iniciar durante su semana vigente.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <Button variant="outline" render={<a href="/week" />}>
        Abrir Mi semana con conexión
      </Button>
    </div>
  );
}
