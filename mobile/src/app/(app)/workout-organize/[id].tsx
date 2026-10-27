import { isTypedTraining } from "../../../lib/training";
import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Keyboard, Text, View } from "react-native";
import { exerciseBlocks } from "../../../../../src/domain/supersets";
import { useTraining } from "../../../lib/training-context";
import {
  TrainingChangeNeedsReview,
  type ExerciseChangeReview,
  type TrainingStructureChange,
} from "../../../lib/training-structure";
import { TrainingChangeReview } from "../../../components/training-change-review";
import { BlockReorder } from "../../../components/block-reorder";
import { MoreButton, PersonalField, SelectionMark } from "../../../components/personal-controls";
import { Action, Notice, Page, ScreenIntro, s, usePalette } from "../../../components/ui";
type Removal = { id: string; review: ExerciseChangeReview };
export default function OrganizeWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    p = usePalette(),
    { controller, training } = useTraining();
  const [selected, setSelected] = useState<string[]>([]),
    [menu, setMenu] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<Removal | null>(null),
    [rest, setRest] = useState<{ id: string; value: string } | null>(null),
    [reordering, setReordering] = useState(false);
  const inFlight = useRef(false);
  const active = training.active;
  const personal =
    active &&
    ((active.draft.version === 3 && active.routine.version === 2) ||
      (isTypedTraining(active) && active.routine.origin.kind !== "assigned")) &&
    active.draft.workoutId === id &&
    active.draft.status === "in_progress";
  const disabled =
    !personal ||
    training.blocked ||
    training.dirty ||
    training.busy ||
    training.closing ||
    busy ||
    active?.pause?.pausedAtMs != null;
  function back() {
    router.navigate({ pathname: "/workout/[id]", params: { id } });
  }
  async function run(op: TrainingStructureChange) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await controller.organize(op);
      setMenu(null);
      setSelected([]);
      setReview(null);
      setRest(null);
    } catch (e) {
      if (e instanceof TrainingChangeNeedsReview && op.kind === "remove")
        setReview({ id: op.id, review: e.review });
      else {
        const current = controller.getSnapshot().active;
        if (
          op.kind === "remove" &&
          current?.draft.workoutId === id &&
          !current.draft.exercises.some((row) => row.sessionExerciseId === op.id)
        )
          setReview(null);
        const message = e instanceof Error ? e.message : "No pudimos organizar los ejercicios.";
        setError(message === controller.getSnapshot().error ? null : message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (review)
    return (
      <TrainingChangeReview
        review={review.review}
        action="remove"
        error={error}
        busy={busy}
        onConfirm={() => {
          void run({ kind: "remove", id: review.id, confirmedStamp: review.review.stamp });
        }}
        onCancel={() => {
          setReview(null);
          setError(null);
        }}
      />
    );
  if (!personal || !active)
    return (
      <Page compact>
        <Action label="Volver al entrenamiento" quiet onPress={back} />
        <Notice message="Este entrenamiento no admite organización personal." />
      </Page>
    );
  const rows = active.draft.exercises.map((e) => ({ id: e.sessionExerciseId, ...e })),
    blocks = exerciseBlocks(rows);
  const indices = rows.flatMap((r, i) => (selected.includes(r.id) ? [i] : []));
  const canGroup =
    indices.length >= 2 &&
    indices.length <= 4 &&
    indices.length === selected.length &&
    indices.at(-1)! - indices[0] + 1 === indices.length &&
    indices.every((i) => !rows[i].supersetId);
  if (reordering)
    return (
      <BlockReorder
        blocks={blocks.map((block) => ({
          id: block.id,
          name: block.name,
          members: block.supersetId ? block.exercises.map((e) => e.name) : [],
        }))}
        stamp={JSON.stringify(active.draft)}
        disabled={!!disabled}
        storageError={training.error}
        retryStorage={() => controller.retryStorage()}
        onMove={async (fromId, toId) => {
          await controller.organize({ kind: "reorder", fromId, toId });
          setMenu(null);
          setSelected([]);
          setError(null);
        }}
        onClose={() => setReordering(false)}
      />
    );
  return (
    <Page compact>
      <Action label="Volver al entrenamiento" quiet disabled={busy} onPress={back} />
      <ScreenIntro title="Organizar" />
      {active.pause?.pausedAtMs != null ? (
        <Notice message="El entrenamiento está en pausa. Reanuda para organizar ejercicios." />
      ) : null}
      {training.error ? (
        <Notice
          message={training.error}
          retry={() => {
            void controller
              .retryStorage()
              .then(() => {
                setError(null);
                setSelected([]);
                setMenu(null);
                setRest(null);
              })
              .catch(() => {});
          }}
        />
      ) : null}
      {error ? <Notice message={error} /> : null}
      <Action
        label="Agregar ejercicios"
        secondary
        icon="plus"
        disabled={disabled || rows.length >= 15}
        onPress={() => router.push({ pathname: "/workout-add/[id]", params: { id } })}
      />
      <Action
        label="Reordenar ejercicios"
        quiet
        disabled={disabled || blocks.length < 2}
        onPress={() => {
          Keyboard.dismiss();
          setReordering(true);
        }}
      />
      {selected.length ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.caption, { color: p.muted }]}>{selected.length} seleccionados</Text>
          <Action
            label="Crear superserie"
            secondary
            disabled={disabled || !canGroup}
            onPress={() => {
              void run({ kind: "group", ids: selected, restSeconds: 90 });
            }}
          />
          <Action
            label="Cancelar selección"
            quiet
            disabled={busy}
            onPress={() => setSelected([])}
          />
        </View>
      ) : null}
      {!rows.length ? (
        <Text style={[s.body, { color: p.muted }]}>Agrega ejercicios para continuar.</Text>
      ) : null}
      {blocks.map((block, bi) => (
        <View
          key={block.id}
          style={{ gap: 8, paddingVertical: 12, borderBottomWidth: 0.5, borderColor: p.border }}
        >
          {block.supersetId ? (
            <>
              <View style={s.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text accessibilityRole="header" style={[s.label, { color: p.blue }]}>
                    {block.name}
                  </Text>
                  <Text style={[s.caption, { color: p.muted }]}>
                    {block.exercises[0].supersetRestSeconds ?? 90} s entre rondas
                  </Text>
                </View>
                <MoreButton
                  label={`Opciones de ${block.name}`}
                  disabled={disabled}
                  onPress={() => {
                    setMenu(menu === block.id ? null : block.id);
                    setError(null);
                  }}
                />
              </View>
              {menu === block.id ? (
                <View style={{ gap: 8 }}>
                  <View style={s.row}>
                    <Action
                      label={`Subir ${block.name}`}
                      quiet
                      disabled={disabled || bi === 0}
                      onPress={() => {
                        void run({ kind: "reorder", fromId: block.id, toId: blocks[bi - 1].id });
                      }}
                    />
                    <Action
                      label={`Bajar ${block.name}`}
                      quiet
                      disabled={disabled || bi === blocks.length - 1}
                      onPress={() => {
                        void run({ kind: "reorder", fromId: block.id, toId: blocks[bi + 1].id });
                      }}
                    />
                  </View>
                  <Action
                    label="Cambiar descanso del grupo"
                    quiet
                    disabled={disabled}
                    onPress={() =>
                      setRest({
                        id: block.supersetId!,
                        value: String(block.exercises[0].supersetRestSeconds ?? 90),
                      })
                    }
                  />
                  <Action
                    label="Separar superserie"
                    quiet
                    disabled={disabled}
                    onPress={() => {
                      void run({ kind: "ungroup", groupId: block.supersetId! });
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : null}
          {rest?.id === block.supersetId ? (
            <View style={{ gap: 8 }}>
              <PersonalField
                label="Descanso entre rondas"
                title="Descanso · segundos"
                value={rest.value}
                numeric
                disabled={disabled}
                maxLength={3}
                onChange={(value) => setRest({ ...rest, value })}
              />
              <Action
                label="Aplicar descanso"
                secondary
                disabled={disabled}
                onPress={() => {
                  void run({
                    kind: "groupRest",
                    groupId: rest.id,
                    seconds: rest.value.trim() ? Number(rest.value) : null,
                  });
                }}
              />
              <Action
                label="Cancelar descanso"
                quiet
                disabled={busy}
                onPress={() => setRest(null)}
              />
            </View>
          ) : null}
          {block.exercises.map((row, mi) => {
            const index = rows.findIndex((e) => e.id === row.id),
              label = `${row.name}, ejercicio ${index + 1}`;
            return (
              <View key={row.id} style={{ gap: 8 }}>
                <View style={s.row}>
                  <SelectionMark
                    label={`Seleccionar ejercicio ${index + 1}: ${row.name}`}
                    checked={selected.includes(row.id)}
                    disabled={disabled}
                    onPress={() =>
                      setSelected((ids) =>
                        ids.includes(row.id) ? ids.filter((id) => id !== row.id) : [...ids, row.id],
                      )
                    }
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[s.label, { color: p.ink }]}>
                      {index + 1}. {row.name}
                    </Text>
                    <Text style={[s.caption, { color: p.muted }]}>
                      {row.sets.filter((s) => s.done).length}/{row.sets.length} series
                    </Text>
                  </View>
                  <MoreButton
                    label={`Opciones de ${label}`}
                    disabled={disabled}
                    onPress={() => {
                      setMenu(menu === row.id ? null : row.id);
                      setError(null);
                    }}
                  />
                </View>
                {menu === row.id ? (
                  <View style={{ gap: 4, paddingLeft: 44 }}>
                    <Action
                      label="Reemplazar ejercicio"
                      quiet
                      disabled={disabled}
                      onPress={() =>
                        router.push({
                          pathname: "/workout-replace/[id]",
                          params: { id, rowId: row.id },
                        })
                      }
                    />
                    {!block.supersetId ? (
                      <View style={s.row}>
                        <Action
                          label={`Subir ${row.name}`}
                          quiet
                          disabled={disabled || bi === 0}
                          onPress={() => {
                            void run({ kind: "reorder", fromId: row.id, toId: blocks[bi - 1].id });
                          }}
                        />
                        <Action
                          label={`Bajar ${row.name}`}
                          quiet
                          disabled={disabled || bi === blocks.length - 1}
                          onPress={() => {
                            void run({ kind: "reorder", fromId: row.id, toId: blocks[bi + 1].id });
                          }}
                        />
                      </View>
                    ) : (
                      <>
                        <View style={s.row}>
                          {([-1, 1] as const).map((direction) => (
                            <Action
                              key={direction}
                              label={
                                direction < 0 ? "Antes en superserie" : "Después en superserie"
                              }
                              quiet
                              disabled={
                                disabled ||
                                mi + direction < 0 ||
                                mi + direction >= block.exercises.length
                              }
                              onPress={() => {
                                const ids = block.exercises.map((e) => e.id);
                                [ids[mi], ids[mi + direction]] = [ids[mi + direction], ids[mi]];
                                void run({ kind: "memberOrder", groupId: block.supersetId!, ids });
                              }}
                            />
                          ))}
                        </View>
                        <Action
                          label="Sacar de superserie"
                          quiet
                          disabled={disabled}
                          onPress={() => {
                            void run({ kind: "detach", id: row.id });
                          }}
                        />
                      </>
                    )}
                    <Action
                      label="Quitar ejercicio"
                      quiet
                      disabled={disabled}
                      onPress={() => {
                        void run({ kind: "remove", id: row.id });
                      }}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </Page>
  );
}
