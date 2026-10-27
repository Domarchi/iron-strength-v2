import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Text, View } from "react-native";
import { prepareWorkoutRoutine } from "../../../../../src/domain/workout-routine";
import {
  editablePersonalItems,
  forkPersonalItems,
  type PersonalEditorItem,
} from "../../../../../src/domain/personal-routines";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
import { useLibraryDrafts } from "../../../lib/library-context";
import { LibraryAttempt } from "../../../components/library-attempt";
import { Action, Loading, Notice, Page, ScreenIntro, s, usePalette } from "../../../components/ui";

function RoutineSummary({ items }: { items: PersonalEditorItem[] }) {
  const p = usePalette();
  return (
    <View style={{ gap: 12 }}>
      {items.map((e, index) => (
        <View key={e.id} style={{ gap: 4 }}>
          <Text style={[s.label, { color: p.ink }]}>
            {index + 1}. {e.name}
          </Text>
          <Text style={[s.body, { color: p.muted }]}>
            {e.series
              ? e.series
                  .map(
                    (r, i) =>
                      `${i + 1}: ${r.repsMin}–${r.repsMax} reps${r.targetWeightKg ? ` · ${r.targetWeightKg} kg` : ""}`,
                  )
                  .join(" / ")
              : `${e.sets} × ${e.repsMin}–${e.repsMax} reps${e.targetWeightKg ? ` · ${e.targetWeightKg} kg` : ""}`}
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>
            {e.supersetId
              ? `Superserie · descanso ${e.supersetRestSeconds ?? "habitual"}${e.supersetRestSeconds == null ? "" : " s"}`
              : `Descanso ${e.restSeconds === "" ? "habitual" : e.restSeconds + " s"}`}
          </Text>
          {e.note ? <Text style={[s.body, { color: p.muted }]}>{e.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export default function SaveRoutineRoute() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>(),
    { state } = useSession();
  const userId = state.status === "authenticated" ? state.session.profile.id : "";
  return (
    <SaveRoutinePreview
      key={`${userId}:${id}:${mode}`}
      id={typeof id === "string" ? id : ""}
      initialUpdate={mode === "update"}
    />
  );
}
function SaveRoutinePreview({ id, initialUpdate }: { id: string; initialUpdate: boolean }) {
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, library } = useLibraryDrafts();
  const offline = state.status === "authenticated" && state.mode === "offline";
  const load = useCallback(async () => {
    const before = client.getSnapshot();
    if (before.status !== "authenticated" || before.mode !== "online")
      throw Error("Conecta para preparar la rutina.");
    const [result, catalog, bases] = await Promise.all([
      client.workout(id),
      client.exerciseCatalog(),
      client.personalLibrary(),
    ]);
    const after = client.getSnapshot();
    if (
      after.status !== "authenticated" ||
      after.session.profile.id !== before.session.profile.id ||
      bases.userId !== before.session.profile.id
    )
      throw Error("La cuenta cambió. Vuelve a abrir el resultado.");
    const base =
      result.workout.sourceKind === "personal"
        ? (bases.routines.find((r) => r.id === result.workout.personalRoutineId) ?? null)
        : null;
    return {
      userId: before.session.profile.id,
      workout: result.workout,
      base,
      prepared: prepareWorkoutRoutine(result.workout, catalog.exercises),
    };
  }, [client, id]);
  const q = useQuery(load);
  const [update, setUpdate] = useState(initialUpdate),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [needsReview, setNeedsReview] = useState(false),
    [stagedId, setStagedId] = useState<string | null>(null);
  const live = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const source = q.value,
    prepared = source?.prepared,
    base = source?.base;
  const updating = update && !!base;
  const existing = updating ? library.drafts.find((d) => d.id === base.id && d.changed) : null;
  const staged = stagedId ? library.drafts.find((d) => d.id === stagedId) : null;
  const open = (draftId: string) =>
    router.push({ pathname: "/library/[id]", params: { id: draftId } });
  async function begin() {
    if (
      inFlight.current ||
      !source?.prepared.ok ||
      q.loading ||
      q.error ||
      offline ||
      needsReview ||
      staged
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const latest = await load();
      if (!live.current) return;
      const after = client.getSnapshot();
      if (
        after.status !== "authenticated" ||
        after.session.profile.id !== source.userId ||
        after.mode !== "online"
      )
        throw Error("La cuenta o conexión cambió. Revisa de nuevo la rutina.");
      if (JSON.stringify(latest) !== JSON.stringify(source)) {
        setNeedsReview(true);
        throw Error(
          "El resultado, catálogo o base cambió. Actualiza la vista previa antes de continuar.",
        );
      }
      const draft = {
        id: updating ? base.id : randomUUID(),
        baseRevision: updating ? base.revision : null,
        folderId: updating ? base.folderId : null,
        changed: true,
        name: updating ? base.name : source.prepared.title,
        items: updating
          ? source.prepared.items
          : forkPersonalItems(source.prepared.items, randomUUID),
      };
      setStagedId(draft.id);
      await controller.stageDraft(draft);
      if (live.current) open(draft.id);
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "No pudimos preparar el borrador.");
    } finally {
      inFlight.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <Page compact>
      <Action label="Volver al resultado" quiet disabled={busy} onPress={() => router.back()} />
      <ScreenIntro
        title="Guardar como rutina"
        description={prepared?.ok ? prepared.title : undefined}
      />
      {q.loading && !source ? <Loading /> : null}
      {q.error ? <Notice message={q.error} retry={offline ? undefined : q.retry} /> : null}
      {error && error !== library.error ? (
        <Notice
          message={error}
          retry={
            staged
              ? undefined
              : () => {
                  setNeedsReview(false);
                  setError(null);
                  q.retry();
                }
          }
        />
      ) : null}
      <LibraryAttempt />
      {prepared && !prepared.ok ? <Notice message={prepared.message} /> : null}
      {prepared?.ok ? (
        <>
          {base ? (
            <View style={{ gap: 8 }}>
              <Action
                label="Crear rutina independiente"
                secondary={updating}
                disabled={busy || !!staged}
                onPress={() => setUpdate(false)}
              />
              <Action
                label="Actualizar mi rutina"
                secondary={!updating}
                disabled={busy || !!staged}
                onPress={() => setUpdate(true)}
              />
            </View>
          ) : source?.workout.personalRoutineId || initialUpdate ? (
            <Text style={[s.body, { color: p.muted }]}>
              La base ya no está disponible. Puedes guardar una rutina independiente.
            </Text>
          ) : null}
          {prepared.kind === "derived" ? (
            <Text style={[s.body, { color: p.muted }]}>
              Objetivos preparados desde tus series de trabajo. Este resultado no guarda la
              prescripción original; descanso habitual de 90 s.
            </Text>
          ) : (
            <Text style={[s.caption, { color: p.muted }]}>
              Se conserva toda la estructura, incluidos ejercicios sin series realizadas.
            </Text>
          )}
          {updating ? (
            <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
              <Text style={[s.subheading, { color: p.ink }]}>Base actual · {base.name}</Text>
              {base.revision !== source?.workout.personalRoutineRevision ? (
                <Text style={[s.body, { color: p.danger }]}>
                  La base cambió desde este entrenamiento. Revisa lo que vas a reemplazar.
                </Text>
              ) : null}
              <RoutineSummary items={editablePersonalItems(base)} />
            </View>
          ) : null}
          <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
            <Text style={[s.subheading, { color: p.ink }]}>
              {updating ? "Propuesta de reemplazo" : "Nueva rutina"} · {prepared.items.length}{" "}
              ejercicios
            </Text>
            <RoutineSummary items={prepared.items} />
          </View>
          <Text style={[s.caption, { color: p.muted }]}>
            {updating
              ? "Se conservarán el nombre y la carpeta de tu base."
              : "Se creará una copia independiente en Mis rutinas."}{" "}
            Podrás ajustar el borrador y confirmar con Guardar en el editor. Tu entrenamiento
            permanece intacto.
          </Text>
          {staged || existing ? (
            <>
              <Text style={[s.body, { color: p.muted }]}>
                {staged
                  ? "Tu propuesta está en el editor."
                  : "Esta base ya tiene un borrador con cambios. Se conserva tu edición."}
              </Text>
              <Action
                label="Abrir borrador"
                disabled={busy}
                onPress={() => open((staged ?? existing)!.id)}
              />
            </>
          ) : (
            <Action
              label={updating ? "Revisar actualización en el editor" : "Continuar al editor"}
              busy={busy}
              disabled={
                busy ||
                offline ||
                q.loading ||
                !!q.error ||
                needsReview ||
                !library.ready ||
                library.blocked ||
                library.dirty ||
                !!library.pending
              }
              onPress={() => {
                void begin();
              }}
            />
          )}
        </>
      ) : null}
    </Page>
  );
}
