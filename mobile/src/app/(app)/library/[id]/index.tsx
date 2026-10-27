import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Keyboard, ScrollView, Text, View } from "react-native";
import {
  reorderExerciseBlocks,
  reorderGroupMembers,
} from "../../../../../../src/domain/exercise-layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  detachPersonalItem,
  duplicatePersonalItem,
  groupPersonalItems,
  movePersonalBlock,
  personalEditorBlocks,
  removePersonalItem,
  ungroupPersonalItems,
} from "../../../../../../src/domain/personal-routines";
import {
  patchTypedPersonalItems as patchPersonalItems,
  personalTargetFields,
  type TypedPersonalBulkPatch as PersonalBulkPatch,
  type TypedPersonalEditorItem as PersonalEditorItem,
} from "../../../../../../src/domain/typed-personal-routines";
import { useLibraryDrafts } from "../../../../lib/library-context";
import { useSession } from "../../../../lib/session";
import { useQuery } from "../../../../lib/use-query";
import { Action, Loading, Notice, s, usePalette } from "../../../../components/ui";
import { ConnectionStatus } from "../../../../components/connection-status";
import { PersonalField, SelectionMark } from "../../../../components/personal-controls";
import { PersonalEditorRow } from "../../../../components/typed-personal-editor-row";
import { LibraryAttempt } from "../../../../components/library-attempt";
import { BlockReorder } from "../../../../components/block-reorder";
export default function PersonalRoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    p = usePalette(),
    insets = useSafeAreaInsets(),
    { client, state } = useSession(),
    { controller, library } = useLibraryDrafts();
  const q = useQuery(useCallback(() => client.trainingLibrary(), [client]));
  const draft = library.drafts.find((d) => d.id === id),
    pending = library.pending?.draftId === id;
  const [error, setError] = useState<string | null>(null),
    [menu, setMenu] = useState<string | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [confirmDiscard, setConfirmDiscard] = useState(false),
    [serverVisible, setServerVisible] = useState(false),
    [confirmServer, setConfirmServer] = useState(false),
    [bulk, setBulk] = useState(false),
    [patch, setPatch] = useState<PersonalBulkPatch>({}),
    [preview, setPreview] = useState<PersonalEditorItem[] | null>(null),
    [reordering, setReordering] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!library.ready || library.blocked || library.busy || !q.value) return;
      const base = q.value.routines.find((r) => r.id === id);
      if (base) void controller.createDraft(base).catch((e) => setError(e.message));
    }, [controller, id, library.ready, library.blocked, library.busy, q.value, setError]),
  );
  const offline = state.status === "authenticated" && state.mode === "offline";
  const disabled = library.busy || library.blocked || pending;
  const selectedIds = selected.filter((itemId) => draft?.items.some((item) => item.id === itemId));
  const latest = q.value?.routines.find((r) => r.id === id);
  function update(change: (items: PersonalEditorItem[]) => PersonalEditorItem[]) {
    setError(null);
    return controller
      .edit(id, (d) => ({ ...d, items: change(d.items) }))
      .then(
        () => true,
        (e) => {
          setError(e.message);
          return false;
        },
      );
  }
  function action(
    itemId: string,
    kind: "up" | "down" | "duplicate" | "remove" | "detach" | "earlier" | "later",
  ) {
    setMenu(null);
    update((items) => {
      if (kind === "earlier" || kind === "later") {
        const groupId = items.find((item) => item.id === itemId)?.supersetId;
        if (!groupId) throw Error("Ese ejercicio ya no está en una superserie.");
        const ids = items.filter((item) => item.supersetId === groupId).map((item) => item.id),
          from = ids.indexOf(itemId),
          to = from + (kind === "earlier" ? -1 : 1);
        if (to < 0 || to >= ids.length) return items;
        [ids[from], ids[to]] = [ids[to], ids[from]];
        return [...reorderGroupMembers(items, groupId, ids)];
      }
      return kind === "up"
        ? movePersonalBlock(items, itemId, -1)
        : kind === "down"
          ? movePersonalBlock(items, itemId, 1)
          : kind === "duplicate"
            ? duplicatePersonalItem(items, itemId, randomUUID())
            : kind === "detach"
              ? detachPersonalItem(items, itemId)
              : removePersonalItem(items, itemId);
    });
  }
  async function save() {
    setError(null);
    try {
      await controller.saveDraft(id);
      router.replace("/library");
    } catch (e) {
      setError((e as Error).message);
      q.retry();
    }
  }
  const close = () => router.navigate("/library");
  if (!library.ready) return <Loading />;
  if (!draft)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: p.bg,
          padding: 24,
          paddingTop: insets.top + 24,
          gap: 16,
        }}
      >
        <Action label="Volver a mis rutinas" quiet onPress={close} />
        {q.loading ? (
          <Loading />
        ) : (
          <Notice
            message={library.error ?? q.error ?? "Esta rutina ya no está disponible."}
            retry={q.retry}
          />
        )}
      </View>
    );
  const blocks = personalEditorBlocks(draft.items);
  if (reordering)
    return (
      <BlockReorder
        blocks={blocks.map((block) => ({
          id: block.id,
          name: block.name,
          members: block.supersetId ? block.exercises.map((e) => e.name) : [],
        }))}
        stamp={JSON.stringify(draft.items)}
        disabled={!!disabled || library.dirty}
        storageError={library.error}
        retryStorage={() => controller.retryStorage()}
        onMove={async (from, to) => {
          await controller.edit(id, (d) => ({
            ...d,
            items: [...reorderExerciseBlocks(d.items, from, to)],
          }));
          setMenu(null);
          setSelected([]);
          setError(null);
        }}
        onClose={() => setReordering(false)}
      />
    );
  let groupNumber = 0;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 6,
          borderBottomWidth: 0.5,
          borderColor: p.border,
        }}
      >
        <Action label="Volver" accessibilityLabel="Volver a mis rutinas" quiet onPress={close} />
        <Action
          label="Guardar"
          accessibilityLabel="Guardar rutina"
          busy={library.busy}
          disabled={
            disabled || !!library.pending || offline || !draft.name.trim() || !draft.changed
          }
          onPress={() => {
            void save();
          }}
        />
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          paddingHorizontal: 20,
          paddingVertical: 20,
          paddingBottom: insets.bottom + 32,
          gap: 16,
        }}
      >
        <ConnectionStatus />
        <PersonalField
          title="Nombre de la rutina"
          label="Nombre de la rutina"
          value={draft.name}
          disabled={disabled}
          onChange={(name) => {
            setError(null);
            void controller.edit(id, (d) => ({ ...d, name })).catch((e) => setError(e.message));
          }}
        />
        <Text
          accessibilityLiveRegion="polite"
          style={[s.caption, { color: library.dirty ? p.danger : p.muted }]}
        >
          {library.dirty
            ? "Cambios pendientes"
            : pending
              ? "Pendiente de confirmar"
              : draft.changed
                ? "Guardado en este dispositivo"
                : "Sin cambios"}
        </Text>
        <LibraryAttempt onConfirmed={close} />
        {error && error !== library.error ? <Notice message={error} /> : null}
        {pending && library.issue ? (
          <>
            <Action
              label="Ver versión actual"
              secondary
              disabled={library.busy || offline}
              onPress={() => {
                q.retry();
                setServerVisible(true);
              }}
            />
            {serverVisible ? (
              <View style={[s.card, { borderColor: p.border, backgroundColor: p.card }]}>
                {latest ? (
                  <>
                    <Text style={[s.label, { color: p.ink }]}>{latest.name}</Text>
                    <Text style={[s.caption, { color: p.muted }]}>
                      {latest.items.length} ejercicios ·{" "}
                      {latest.items.reduce((n, item) => n + item.prescribed.sets, 0)} series
                    </Text>
                    <Action
                      label="Usar versión actual"
                      quiet
                      onPress={() => setConfirmServer(true)}
                    />
                    {confirmServer ? (
                      <>
                        <Text style={[s.body, { color: p.ink }]}>
                          Se descartarán los cambios locales de esta rutina.
                        </Text>
                        <Action
                          label="Confirmar versión del servidor"
                          disabled={library.busy}
                          onPress={() => {
                            void controller
                              .discardDraft(id, true)
                              .then(() => controller.createDraft(latest))
                              .then(() => {
                                setConfirmServer(false);
                                setServerVisible(false);
                                setError(null);
                              })
                              .catch((e) => setError(e.message));
                          }}
                        />
                      </>
                    ) : null}
                  </>
                ) : (
                  <Text style={[s.body, { color: p.muted }]}>
                    La rutina ya no está en la biblioteca del servidor.
                  </Text>
                )}
              </View>
            ) : null}
            <Action
              label="Crear copia del borrador"
              disabled={library.busy}
              onPress={() => {
                void controller
                  .forkDraft(id)
                  .then((next) =>
                    router.replace({ pathname: "/library/[id]", params: { id: next } }),
                  )
                  .catch((e) => setError(e.message));
              }}
            />
          </>
        ) : null}
        {selectedIds.length ? (
          <View style={[s.card, { borderColor: p.border, backgroundColor: p.raised }]}>
            <View style={s.row}>
              <Text style={[s.label, { color: p.ink }]}>{selectedIds.length} seleccionados</Text>
              <Action
                label="Limpiar selección"
                quiet
                onPress={() => {
                  setSelected([]);
                  setPatch({});
                  setBulk(false);
                  setPreview(null);
                }}
              />
            </View>
            <View style={s.row}>
              <Action
                label="Agrupar"
                accessibilityLabel="Agrupar ejercicios"
                secondary
                disabled={disabled || selectedIds.length < 2 || selectedIds.length > 4}
                onPress={() => {
                  void update((items) => groupPersonalItems(items, selectedIds, randomUUID())).then(
                    (success) => {
                      if (success) setSelected([]);
                    },
                  );
                }}
              />
              <Action
                label="Editar selección"
                secondary
                disabled={disabled}
                onPress={() => {
                  setBulk(!bulk);
                  setPreview(null);
                }}
              />
            </View>
            {bulk ? (
              <>
                {(
                  [
                    "sets",
                    "repsMin",
                    "repsMax",
                    "targetWeightKg",
                    "targetDurationSeconds",
                    "targetDistanceMeters",
                    "restSeconds",
                  ] as const
                )
                  .filter(
                    (field) =>
                      field === "sets" ||
                      field === "restSeconds" ||
                      draft.items
                        .filter((i) => selectedIds.includes(i.id))
                        .every((i) => personalTargetFields(i.recordType).includes(field)),
                  )
                  .map((field) => {
                    const index = [
                      "sets",
                      "repsMin",
                      "repsMax",
                      "targetWeightKg",
                      "targetDurationSeconds",
                      "targetDistanceMeters",
                      "restSeconds",
                    ].indexOf(field);
                    const label = [
                      "Series",
                      "Repeticiones mínimas",
                      "Repeticiones máximas",
                      "Peso (kg)",
                      "Tiempo (s)",
                      "Distancia (m)",
                      "Descanso (s)",
                    ][index];
                    return (
                      <View
                        key={field}
                        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <SelectionMark
                          label={`Cambiar ${label.toLocaleLowerCase("es")}`}
                          checked={patch[field] !== undefined}
                          disabled={disabled}
                          onPress={() => {
                            setPreview(null);
                            setPatch((previous) => {
                              const next = { ...previous };
                              if (next[field] !== undefined) delete next[field];
                              else next[field] = ["3", "8", "12", "", "", "", "90"][index];
                              return next;
                            });
                          }}
                        />
                        <PersonalField
                          label={`${label} de la selección`}
                          title={label}
                          value={patch[field] ?? ""}
                          disabled={disabled || patch[field] === undefined}
                          numeric
                          maxLength={20}
                          onChange={(value) => {
                            setPreview(null);
                            setPatch((previous) => ({ ...previous, [field]: value }));
                          }}
                        />
                      </View>
                    );
                  })}
                {!preview ? (
                  <Action
                    label="Revisar cambios de selección"
                    secondary
                    disabled={disabled || !Object.keys(patch).length}
                    onPress={() => {
                      try {
                        setPreview(patchPersonalItems(draft.items, selectedIds, patch));
                        setError(null);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  />
                ) : (
                  <>
                    <Text style={[s.caption, { color: p.muted }]}>
                      Se cambiarán {Object.keys(patch).length} campos en {selectedIds.length}{" "}
                      ejercicios. Las notas y los demás campos se conservan.
                    </Text>
                    <Action
                      label="Aplicar a la selección"
                      disabled={disabled}
                      onPress={() => {
                        update((items) => patchPersonalItems(items, selectedIds, patch));
                        setPreview(null);
                        setBulk(false);
                        setSelected([]);
                      }}
                    />
                  </>
                )}
              </>
            ) : null}
          </View>
        ) : null}
        <Action
          label="Reordenar ejercicios"
          quiet
          disabled={disabled || library.dirty || blocks.length < 2}
          onPress={() => {
            Keyboard.dismiss();
            setReordering(true);
          }}
        />
        {blocks.map((block, blockIndex) => {
          const number = block.supersetId ? ++groupNumber : 0;
          return (
            <View
              key={block.id}
              style={
                block.supersetId
                  ? { borderLeftWidth: 2, borderColor: p.blue, paddingLeft: 10 }
                  : undefined
              }
            >
              {block.supersetId ? (
                <>
                  <View style={s.row}>
                    <Text style={[s.label, { color: p.blue }]}>Superserie {number}</Text>
                    <Action
                      label="Separar"
                      accessibilityLabel={`Separar superserie ${number}`}
                      quiet
                      disabled={disabled}
                      onPress={() =>
                        update((items) => ungroupPersonalItems(items, block.supersetId!))
                      }
                    />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[s.caption, { color: p.muted, flex: 1 }]}>
                      Descanso entre rondas
                    </Text>
                    <View style={{ width: 80 }}>
                      <PersonalField
                        label={`Descanso de superserie ${number}`}
                        value={
                          block.exercises[0].supersetRestSeconds === null
                            ? ""
                            : String(block.exercises[0].supersetRestSeconds)
                        }
                        numeric
                        maxLength={3}
                        disabled={disabled}
                        onChange={(value) => {
                          if (/^\d*$/.test(value))
                            update((items) =>
                              items.map((item) =>
                                item.supersetId === block.supersetId
                                  ? {
                                      ...item,
                                      supersetRestSeconds: value === "" ? null : Number(value),
                                    }
                                  : item,
                              ),
                            );
                        }}
                      />
                    </View>
                    <Text style={[s.caption, { color: p.muted }]}>s</Text>
                  </View>
                </>
              ) : null}
              {block.exercises.map((item, memberIndex) => (
                <PersonalEditorRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  canUp={blockIndex > 0}
                  canDown={blockIndex < blocks.length - 1}
                  canEarlier={memberIndex > 0}
                  canLater={memberIndex < block.exercises.length - 1}
                  disabled={disabled}
                  onToggle={() => {
                    setSelected((previous) =>
                      previous.includes(item.id)
                        ? previous.filter((id) => id !== item.id)
                        : [...previous, item.id],
                    );
                    setPatch({});
                    setPreview(null);
                  }}
                  onChange={(patch) =>
                    update((items) =>
                      items.map((row) => (row.id === item.id ? { ...row, ...patch } : row)),
                    )
                  }
                  menuOpen={menu === item.id}
                  onMenu={() => setMenu(menu === item.id ? null : item.id)}
                  onAction={(kind) => action(item.id, kind)}
                />
              ))}
            </View>
          );
        })}
        <Action
          label="Agregar ejercicios"
          secondary
          icon="plus"
          disabled={disabled || !!library.pending || offline || draft.items.length >= 15}
          onPress={() => router.push({ pathname: "/library/[id]/add", params: { id } })}
        />
        {offline ? (
          <Text style={[s.caption, { color: p.muted }]}>
            El borrador se conserva aquí. Conecta para agregar ejercicios o guardar en el servidor.
          </Text>
        ) : null}
        {confirmDiscard ? (
          <>
            <Text style={[s.body, { color: p.ink }]}>
              Se descartarán los cambios de este dispositivo. Si el intento ya se guardó en el
              servidor, la rutina seguirá en tu biblioteca.
            </Text>
            <Action
              label="Confirmar descarte de borrador"
              secondary
              disabled={library.busy}
              onPress={() => {
                void controller
                  .discardDraft(id, true)
                  .then(close)
                  .catch((e) => setError(e.message));
              }}
            />
            <Action label="Mantener borrador" quiet onPress={() => setConfirmDiscard(false)} />
          </>
        ) : draft.changed || pending ? (
          <Action
            label="Descartar borrador"
            quiet
            disabled={library.busy || library.blocked}
            onPress={() => setConfirmDiscard(true)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
