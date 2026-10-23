"use client";
import {
  programHref,
  navigationContext,
  type TrainingNavigation,
} from "@/lib/navigation/training-context";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { assignmentImpacts, assignmentWindow, type AssignmentInput } from "@/lib/coach/planning";
import type { ProgramTree } from "@/lib/data/programs";
import { confirmPlanningAction, reviewAssignmentAction } from "../planning-actions";
import { usePlanningDraft, subscribePlanningHydration } from "./use-planning-draft";
export type AssignTarget = { id: string; label: string };
type Props = {
  userId: string;
  tree: ProgramTree;
  targets: AssignTarget[];
  defaultStartDate: string;
  today: string;
  selectedStudentId?: string;
  navigation?: TrainingNavigation;
};
export function AssignForm(props: Props) {
  const ready = useSyncExternalStore(
    subscribePlanningHydration,
    () => true,
    () => false,
  );
  return ready ? <AssignEditor {...props} /> : null;
}
function AssignEditor({
  userId,
  tree,
  targets,
  defaultStartDate,
  today,
  selectedStudentId,
  navigation = navigationContext(),
}: Props) {
  const local = usePlanningDraft(userId, tree.id, "assign");
  const restored = local.draft?.operation === "assign" ? local.draft.input : null;
  const [expanded, setExpanded] = useState(!!local.draft);
  const [studentId, setStudentId] = useState(restored?.studentId ?? selectedStudentId ?? "");
  const [date, setDate] = useState(restored?.startDate ?? defaultStartDate);
  const [preview, setPreview] = useState<AssignmentInput | null>(restored);
  const [studentLabel, setStudentLabel] = useState(
    targets.find((t) => t.id === (restored?.studentId ?? selectedStudentId))?.label ?? "",
  );
  const [acknowledged, setAcknowledged] = useState(!!restored);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const range = preview
    ? assignmentWindow(preview.startDate, preview.source.weeksCount, today)
    : null;
  const impacts = preview && range ? assignmentImpacts(preview.existing, range) : [];
  const emptyWeeks = preview
    ? Array.from({ length: preview.source.weeksCount }, (_, i) => i + 1).filter(
        (w) => !preview.source.sessions.some((s) => s.weekNumber === w),
      )
    : [];
  function review() {
    const window = assignmentWindow(date, tree.weeksCount, today);
    if (!studentId || !window) {
      setError("Elige un alumno y un inicio desde el lunes de esta semana.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await reviewAssignmentAction(tree.id, studentId, window.startDate);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setPreview({ studentId, startDate: window.startDate, ...result.preview });
        setStudentLabel(result.studentLabel);
        setAcknowledged(false);
      } catch {
        setError("No se pudo cargar la revisión. Conservamos el alumno y la fecha elegidos.");
      }
    });
  }
  function confirm() {
    setExpanded(true);
    if (!preview && !restored) return;
    const draft = local.prepare(preview ?? restored!);
    if (!draft) return;
    setError(null);
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
        if (!("programId" in result) || !result.programId) {
          setError("No recibimos confirmación de la asignación. Conservamos el intento.");
          return;
        }
        local.finish(draft);
        router.push(programHref(result.programId, navigation, studentId));
      } catch {
        setError(
          "No recibimos confirmación. Confirma el mismo intento para recuperar la copia asignada.",
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
        Asignar a un alumno
      </summary>
      <fieldset
        disabled={pending || local.blocked || !!local.draft}
        className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium">
          Alumno
          <NativeSelect
            aria-label="Alumno"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setPreview(null);
              setAcknowledged(false);
            }}
          >
            <option value="">Elige un alumno</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Inicio
          <Input
            type="date"
            aria-label="Inicio"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPreview(null);
              setAcknowledged(false);
            }}
            required
            className="h-11"
          />
        </label>
        <Button variant="outline" onClick={review} disabled={!studentId || !date}>
          Revisar asignación
        </Button>
        <p className="basis-full text-xs text-muted-foreground">
          La semana 1 empieza el lunes de la fecha elegida. El alumno recibe una copia independiente
          de esta base.
        </p>
      </fieldset>
      {preview && range ? (
        <section
          aria-label="Vista previa de asignación"
          className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
        >
          <h3 className="font-semibold">Revisar asignación</h3>
          <p className="text-sm">
            <strong>{studentLabel}</strong> · {preview.source.name}
          </p>
          <p className="text-sm">
            Lunes de inicio: {range.startDate} · Fin: {range.endsOn}
          </p>
          <p className="text-sm">
            {preview.source.weeksCount} semanas · {preview.source.sessions.length} sesiones
          </p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {Array.from({ length: preview.source.weeksCount }, (_, i) => i + 1).map((w) => (
              <li key={w} className="rounded-md border bg-card p-2">
                Semana {w}: {preview.source.sessions.filter((s) => s.weekNumber === w).length}{" "}
                sesiones{emptyWeeks.includes(w) ? " · Descarga sin sesiones" : ""}
              </li>
            ))}
          </ul>
          <p className="text-sm">
            {emptyWeeks.length
              ? `Semanas sin sesiones: ${emptyWeeks.join(", ")}.`
              : "Todas las semanas tienen sesiones."}
          </p>
          {impacts.length ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Cambios en los programas existentes</p>
              {impacts.map((p) => (
                <p key={p.id} className="text-sm">
                  {p.name}:{" "}
                  {p.kind === "shorten"
                    ? `terminará el ${p.endsOn}.`
                    : p.blocked
                      ? "ya tiene entrenamientos y no puede reemplazarse."
                      : "será reemplazado por esta copia."}
                </p>
              ))}
              {!impacts.some((p) => p.blocked) ? (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={acknowledged}
                    disabled={pending || !!local.draft}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  Confirmo los cambios en los programas existentes
                </label>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {preview || local.draft ? (
        <Button
          className="mt-3"
          disabled={
            pending ||
            local.blocked ||
            (!local.draft &&
              (impacts.some((p) => p.blocked) || (impacts.length > 0 && !acknowledged)))
          }
          onClick={confirm}
        >
          {pending ? "Confirmando…" : "Confirmar asignación"}
        </Button>
      ) : null}
      {local.draft ? (
        <p role="status" className="mt-2 text-sm">
          Petición guardada en este dispositivo. Puedes confirmar la misma asignación después de
          recargar.
        </p>
      ) : null}
      {local.blocked ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Guarda o resuelve los cambios pendientes antes de asignar.
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
    </details>
  );
}
