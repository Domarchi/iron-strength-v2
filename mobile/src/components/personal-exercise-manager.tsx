import { useCallback, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PersonalExerciseLibrary } from "../../../src/lib/mobile/personal-exercise-contracts";
import { usePersonalExerciseDraft } from "../lib/personal-exercise-context";
import type { PersonalExerciseEntry } from "../lib/personal-exercise-drafts";
import { exportPersonalExerciseFile } from "../lib/personal-exercise-export";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
import { RECORD_TYPE_LABELS } from "../lib/training-labels";
import { Action, Notice, ScreenIntro, s, usePalette } from "./ui";
import { ConnectionStatus } from "./connection-status";
import { PersonalExerciseForm } from "./personal-exercise-form";
import { Icon } from "./icon";
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
export function PersonalExerciseManager() {
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    { client, state } = useSession(),
    { controller, exercises } = usePersonalExerciseDraft();
  const request = useCallback(() => client.personalExercises(), [client]),
    q = useQuery(request);
  const [editing, setEditing] = useState(false),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [menu, setMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PersonalExerciseEntry | null>(null),
    [discard, setDiscard] = useState(false),
    [review, setReview] = useState<PersonalExerciseLibrary | null>(null);
  const [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null),
    [working, setWorking] = useState(false);
  const offline = state.status !== "authenticated" || state.mode === "offline";
  const locked =
    !exercises.ready || exercises.blocked || exercises.busy || exercises.paused || working;
  const pending = exercises.pending,
    draft = exercises.draft;
  const visibleError = error ?? exercises.error;
  async function run(operation: () => Promise<unknown>) {
    setError(null);
    setMessage(null);
    setWorking(true);
    try {
      await operation();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos completar la operación. Conservamos tus cambios.",
      );
    } finally {
      setWorking(false);
    }
  }
  const controls = (
    <>
      {visibleError ? <Notice message={visibleError} /> : null}
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          aria-live="polite"
          style={[s.caption, { color: p.muted }]}
        >
          {message}
        </Text>
      ) : null}
      {exercises.blocked ? (
        <Action
          label="Releer ejercicios locales"
          secondary
          disabled={working}
          onPress={() => {
            void run(() => controller.restore());
          }}
        />
      ) : null}
      {exercises.dirty && !exercises.blocked ? (
        <Action
          label="Reintentar guardado local de ejercicio"
          secondary
          disabled={locked}
          onPress={() => {
            void run(() => controller.retryStorage());
          }}
        />
      ) : null}
      {pending ? (
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
          <Text style={[s.label, { color: p.ink }]}>
            {pending.issue ? "Revisar cambios del ejercicio" : "Ejercicio sin confirmar"}
          </Text>
          {!pending.issue ? (
            <Action
              label="Reintentar guardado de ejercicio"
              secondary
              disabled={locked || offline}
              onPress={() => {
                void run(async () => {
                  await controller.retryPending();
                  setEditing(false);
                  setMessage("Ejercicio confirmado en el servidor");
                });
              }}
            />
          ) : (
            <Action
              label="Revisar versión actual del ejercicio"
              secondary
              disabled={locked || offline}
              onPress={() => {
                void run(async () => {
                  const snapshot = await client.personalExercises();
                  setReview(snapshot);
                });
              }}
            />
          )}
          <Action
            label="Descartar intento del ejercicio"
            quiet
            disabled={locked}
            onPress={() => setDiscard(true)}
          />
        </View>
      ) : draft?.changed ? (
        <Text style={[s.caption, { color: p.muted }]}>
          {exercises.dirty ? "Sin guardar en este dispositivo" : "Guardado en este dispositivo"}
        </Text>
      ) : null}
      {review && pending?.issue ? (
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
          <Text style={[s.label, { color: p.ink }]}>Versión actual del servidor</Text>
          {review.exercises
            .filter((e) => e.id === pending.request.targetId)
            .map((e) => (
              <View key={e.id} style={{ gap: 6 }}>
                <Text style={[s.body, { color: p.ink }]}>{e.name}</Text>
                <Text style={[s.caption, { color: p.muted }]}>
                  {e.muscleGroup} · {e.equipment ?? "Sin equipo"}
                </Text>
                <Text style={[s.caption, { color: p.muted }]}>
                  {e.recordType ? RECORD_TYPE_LABELS[e.recordType] : "Peso y repeticiones"} ·{" "}
                  {e.progressionIncrementKg} kg
                </Text>
                <Text style={[s.caption, { color: p.muted }]}>
                  {e.isBodyweight ? "Con peso corporal" : "Sin peso corporal"} ·{" "}
                  {e.archivedAt ? "Archivado" : "Activo"}
                </Text>
              </View>
            ))}
          {!review.exercises.some((e) => e.id === pending.request.targetId) ? (
            <Text style={[s.body, { color: p.muted }]}>
              Ese identificador no está en tus ejercicios actuales.
            </Text>
          ) : null}
          <Action
            label={draft ? "Conservar mi edición" : "Volver a revisar la acción"}
            secondary
            disabled={locked}
            onPress={() => {
              void run(async () => {
                await controller.resolveConflict(review);
                setReview(null);
                setConfirm(null);
                setMenu(null);
                q.retry();
                setMessage(
                  draft
                    ? "Versión revisada. Guarda cuando termines de editar."
                    : "Versión revisada. Vuelve a elegir la acción.",
                );
              });
            }}
          />
          {draft ? (
            <Action
              label="Conservar como ejercicio nuevo"
              secondary
              disabled={locked}
              onPress={() => {
                void run(async () => {
                  await controller.forkDraft();
                  setReview(null);
                  setEditing(true);
                });
              }}
            />
          ) : null}
          <Action label="Cerrar revisión" quiet onPress={() => setReview(null)} />
        </View>
      ) : null}
      {discard ? (
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
          <Text style={[s.body, { color: p.ink }]}>
            Se descartan los cambios de este dispositivo. Un ejercicio ya guardado en el servidor se
            conserva.
          </Text>
          <Action
            label="Confirmar descarte del ejercicio"
            secondary
            disabled={locked}
            onPress={() => {
              void run(async () => {
                await controller.discard(true);
                setDiscard(false);
                setReview(null);
                setEditing(false);
              });
            }}
          />
          <Action
            label="Cancelar descarte del ejercicio"
            quiet
            disabled={locked}
            onPress={() => setDiscard(false)}
          />
        </View>
      ) : null}
    </>
  );
  if (editing && draft)
    return (
      <PersonalExerciseForm
        key={draft.id}
        draft={draft}
        disabled={locked || !!pending}
        saveDisabled={exercises.dirty}
        onEdit={(patch) => {
          setError(null);
          void controller.edit(patch).catch((e) => setError(e.message));
        }}
        onBack={() => {
          setEditing(false);
          setError(null);
        }}
        onDiscard={() => setDiscard(true)}
        onSave={() => {
          void run(async () => {
            await controller.save();
            setEditing(false);
            setMessage("Ejercicio confirmado en el servidor");
          });
        }}
      >
        {controls}
      </PersonalExerciseForm>
    );
  const needle = normalize(search),
    rows = (q.error ? [] : (q.value?.exercises ?? [])).filter(
      (e) =>
        !!e.archivedAt === archived &&
        normalize(`${e.name} ${e.muscleGroup} ${e.equipment ?? ""}`).includes(needle),
    );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          padding: 20,
          paddingBottom: insets.bottom + 28,
        }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 16 }}>
            <ConnectionStatus />
            <Action
              label="Volver a Biblioteca"
              quiet
              onPress={() => router.navigate("/exercises")}
            />
            <ScreenIntro title="Mis ejercicios" />
            {controls}
            {draft ? (
              <Action
                label={`Retomar ejercicio ${draft.values.name || "Sin nombre"}`}
                secondary
                disabled={locked}
                onPress={() => setEditing(true)}
              />
            ) : null}
            <Action
              label="Nuevo ejercicio"
              disabled={locked || !!pending || !!draft?.changed || exercises.dirty}
              onPress={() => {
                void run(async () => {
                  await controller.open();
                  setEditing(true);
                });
              }}
            />
            <TextInput
              accessibilityLabel="Buscar mis ejercicios"
              placeholder="Buscar mis ejercicios"
              placeholderTextColor={p.muted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              style={[s.input, { color: p.ink, backgroundColor: p.card, borderColor: p.control }]}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              {[false, true].map((value) => (
                <View key={String(value)} style={{ flex: 1 }}>
                  <Pressable
                    accessibilityRole="button"
                    aria-pressed={archived === value}
                    accessibilityLabel={value ? "Archivados" : "Activos"}
                    style={{
                      minHeight: 48,
                      alignItems: "center",
                      justifyContent: "center",
                      borderBottomWidth: archived === value ? 2 : StyleSheet.hairlineWidth,
                      borderBottomColor: archived === value ? p.ink : p.border,
                    }}
                    onPress={() => {
                      setArchived(value);
                      setMenu(null);
                    }}
                  >
                    <Text style={[s.label, { color: archived === value ? p.ink : p.muted }]}>
                      {value ? "Archivados" : "Activos"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
            {q.loading ? (
              <ActivityIndicator accessibilityLabel="Cargando mis ejercicios" color={p.blue} />
            ) : null}
            {q.error ? (
              <Notice message={q.error} retry={q.retry} />
            ) : (
              <Text style={[s.caption, { color: p.muted }]}>
                {rows.length} {rows.length === 1 ? "ejercicio" : "ejercicios"}
              </Text>
            )}
            <View style={s.row}>
              <Action label="Actualizar ejercicios" quiet disabled={working} onPress={q.retry} />
              <Action
                label="Exportar mis ejercicios"
                quiet
                disabled={locked || offline || !!q.error || !q.value}
                onPress={() => {
                  void run(async () => {
                    const snapshot = await client.exportPersonalExercises();
                    await exportPersonalExerciseFile(snapshot);
                    setMessage("Exportación preparada");
                  });
                }}
              />
            </View>
            {confirm ? (
              <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
                <Text style={[s.label, { color: p.ink }]}>Archivar {confirm.name}</Text>
                <Text style={[s.body, { color: p.muted }]}>
                  Se conserva en tus rutinas e historial; deja de aparecer al elegir ejercicios.
                </Text>
                <Action
                  label="Confirmar archivo"
                  secondary
                  disabled={locked || offline || !!pending}
                  onPress={() => {
                    void run(async () => {
                      await controller.archive(confirm, false);
                      setConfirm(null);
                      setMenu(null);
                    });
                  }}
                />
                <Action
                  label="Cancelar archivo"
                  quiet
                  disabled={locked}
                  onPress={() => setConfirm(null)}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !q.loading && !q.error ? (
            <Text style={[s.body, { color: p.muted }]}>
              {search
                ? "No hay coincidencias"
                : archived
                  ? "Sin ejercicios archivados"
                  : "Sin ejercicios propios activos"}
            </Text>
          ) : undefined
        }
        renderItem={({ item: e }) => (
          <View
            style={{
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: p.border,
              paddingVertical: 14,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ gap: 4, flex: 1 }}>
                <Text style={[s.label, { color: p.ink }]}>{e.name}</Text>
                <Text style={[s.caption, { color: p.muted }]}>
                  {e.muscleGroup}
                  {e.equipment ? ` · ${e.equipment}` : ""} ·{" "}
                  {e.recordType ? RECORD_TYPE_LABELS[e.recordType] : "Peso y repeticiones"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Opciones de ${e.name}`}
                accessibilityState={{ disabled: locked }}
                disabled={locked}
                onPress={() => setMenu(menu === e.id ? null : e.id)}
                style={{ width: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="more" color={p.muted} size={21} />
              </Pressable>
            </View>
            {menu === e.id ? (
              <View style={{ gap: 8 }}>
                <Action
                  label={`Editar ${e.name}`}
                  secondary
                  disabled={locked || !!pending || !!draft?.changed}
                  onPress={() => {
                    void run(async () => {
                      await controller.open(e);
                      setEditing(true);
                      setMenu(null);
                    });
                  }}
                />
                <Action
                  label={`${archived ? "Restaurar" : "Archivar"} ${e.name}`}
                  secondary
                  disabled={locked || offline || !!pending || !!draft?.changed}
                  onPress={() => {
                    if (!archived) setConfirm(e);
                    else
                      void run(async () => {
                        await controller.archive(e, true);
                        setMenu(null);
                      });
                  }}
                />
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
