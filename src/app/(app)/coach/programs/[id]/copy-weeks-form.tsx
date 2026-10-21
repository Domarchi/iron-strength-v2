"use client";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { isWeekEditable } from "@/domain/program-weeks";
import { makeCopyInput, weekPlanningSummary, type CopyWeeksInput } from "@/lib/coach/planning";
import type { ProgramTree } from "@/lib/data/programs";
import { confirmPlanningAction, reviewPlanningCopyAction } from "../planning-actions";
import { usePlanningDraft, subscribePlanningHydration } from "./use-planning-draft";
type Props = { tree: ProgramTree; userId: string; today: string };
export function CopyWeeksForm(props: Props) {
  const ready = useSyncExternalStore(
    subscribePlanningHydration,
    () => true,
    () => false,
  );
  return ready ? <CopyForm {...props} /> : null;
}
function CopyForm({ tree, userId, today }: Props) {
  const local = usePlanningDraft(userId, tree.id, "copy");
  const restored = local.draft?.operation === "copy" ? local.draft.input : null;
  const [expanded, setExpanded] = useState(!!local.draft);
  const [sourceWeek, setSourceWeek] = useState(restored?.sourceWeek ?? 1);
  const [targets, setTargets] = useState<number[]>(restored?.targets.map((t) => t.week) ?? []);
  const [reviewTree, setReviewTree] = useState(tree);
  const [preview, setPreview] = useState<CopyWeeksInput | null>(restored);
  const [replacements, setReplacements] = useState<number[]>(
    restored?.targets.filter((t) => t.replace).map((t) => t.week) ?? [],
  );
  const [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const range =
    tree.startDate && tree.endsOn
      ? { startDate: tree.startDate, endsOn: tree.endsOn, weeksCount: tree.weeksCount }
      : null;
  const weeks = Array.from({ length: tree.weeksCount }, (_, i) => i + 1);
  function review() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await reviewPlanningCopyAction(tree.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setReviewTree(result.tree);
        setReplacements([]);
        setPreview(
          makeCopyInput(
            result.tree,
            sourceWeek,
            targets.map((week) => ({ week, replace: false })),
          ),
        );
      } catch {
        setError("No se pudo cargar la revisión. Tus semanas elegidas siguen aquí.");
      }
    });
  }
  function confirm() {
    setExpanded(true);
    if (!preview && !local.draft) return;
    const input = preview
      ? {
          ...preview,
          targets: preview.targets.map((t) => ({
            ...t,
            replace: t.sessions.length > 0 ? replacements.includes(t.week) : false,
          })),
        }
      : restored!;
    const draft = local.prepare(input);
    if (!draft) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await confirmPlanningAction(draft);
        setExpanded(true);
        if (!result.ok) {
          setError(result.error);
          if (!("uncertain" in result && result.uncertain)) {
            local.finish(draft);
            setPreview(null);
          }
          return;
        }
        local.finish(draft);
        setPreview(null);
        setTargets([]);
        setMessage("Copia de semanas confirmada.");
        router.refresh();
      } catch {
        setError(
          "No recibimos confirmación. Confirma el mismo intento para comprobar el lote sin repetirlo.",
        );
      }
    });
  }
  return (
    <details
      className="wrap-anywhere rounded-xl border bg-card p-4"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
        Copiar semana a varias
      </summary>
      <p className="mb-3 text-sm text-muted-foreground">
        Cada destino recibe una copia independiente de sesiones, títulos, días, grupos, descansos,
        notas y alternativas de la semana elegida.
      </p>
      <fieldset disabled={pending || local.blocked || !!local.draft} className="min-w-0 space-y-3">
        <label className="flex max-w-64 flex-col gap-2 text-sm">
          Semana de origen
          <NativeSelect
            aria-label="Semana de origen"
            value={sourceWeek}
            onChange={(e) => {
              const value = Number(e.target.value);
              setSourceWeek(value);
              setTargets(targets.filter((w) => w !== value));
              setPreview(null);
              setMessage(null);
            }}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Semana {w}
              </option>
            ))}
          </NativeSelect>
        </label>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium">Semanas destino</legend>
          <div className="flex flex-wrap gap-2">
            {weeks
              .filter((w) => w !== sourceWeek)
              .map((w) => {
                const editable = isWeekEditable(range, w, today);
                return (
                  <label
                    key={w}
                    className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-5"
                      aria-label={`Semana ${w}`}
                      checked={targets.includes(w)}
                      disabled={!editable}
                      onChange={(e) => {
                        setTargets(
                          e.target.checked
                            ? [...targets, w].sort((a, b) => a - b)
                            : targets.filter((v) => v !== w),
                        );
                        setPreview(null);
                        setMessage(null);
                      }}
                    />
                    Semana {w}
                    {!editable ? " · Bloqueada" : ""}
                  </label>
                );
              })}
          </div>
        </fieldset>
        <Button variant="outline" onClick={review} disabled={!targets.length}>
          Revisar copia
        </Button>
      </fieldset>
      {preview ? (
        <section
          aria-label="Vista previa de copia"
          className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
        >
          <h3 className="font-semibold">Revisar copia de semana {preview.sourceWeek}</h3>
          <p className="text-sm">
            Origen: {weekPlanningSummary(reviewTree, preview.sourceWeek).sessions} sesiones ·{" "}
            {weekPlanningSummary(reviewTree, preview.sourceWeek).exercises} ejercicios ·{" "}
            {weekPlanningSummary(reviewTree, preview.sourceWeek).sets} series
          </p>
          {preview.targets.map((t) => {
            const before = weekPlanningSummary(reviewTree, t.week);
            return (
              <div key={t.week} className="rounded-lg border bg-card p-3 text-sm">
                <p className="font-medium">
                  Semana {t.week}: {before.sessions} sesiones actuales →{" "}
                  {preview.sourceSessions.length} sesiones copiadas
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t.sessions.length
                    ? "Se reemplazará todo el contenido de esta semana."
                    : "Se añadirá la semana elegida al destino vacío."}
                </p>
                {t.sessions.length ? (
                  <label className="mt-2 flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5"
                      aria-label={`Reemplazar semana ${t.week}`}
                      checked={replacements.includes(t.week)}
                      disabled={pending || !!local.draft}
                      onChange={(e) =>
                        setReplacements(
                          e.target.checked
                            ? [...replacements, t.week]
                            : replacements.filter((w) => w !== t.week),
                        )
                      }
                    />
                    Confirmo reemplazar semana {t.week}
                  </label>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}
      {preview || local.draft ? (
        <Button
          className="mt-3"
          disabled={
            pending ||
            local.blocked ||
            (!local.draft &&
              !!preview?.targets.some(
                (t) => t.sessions.length > 0 && !replacements.includes(t.week),
              ))
          }
          onClick={confirm}
        >
          {pending ? "Confirmando…" : "Confirmar copia de semanas"}
        </Button>
      ) : null}
      {local.draft ? (
        <p role="status" className="mt-2 text-sm">
          Petición guardada en este dispositivo. Puedes confirmar el mismo lote después de recargar.
        </p>
      ) : null}
      {local.blocked ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Guarda o resuelve los cambios pendientes de las sesiones antes de copiar.
        </p>
      ) : null}
      {local.storageError ? (
        <StatusMessage error className="mt-3">
          {local.storageError}
        </StatusMessage>
      ) : null}
      {error ? (
        <StatusMessage error className="mt-3">
          {error}
        </StatusMessage>
      ) : null}
      {message ? <StatusMessage className="mt-3">{message}</StatusMessage> : null}
    </details>
  );
}
