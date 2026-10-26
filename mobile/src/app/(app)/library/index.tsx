import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../../../lib/motion-context";
import { useCallback, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type {
  PersonalMutation,
  PersonalRoutine,
} from "../../../../../src/lib/mobile/personal-contracts";
import { Action, Loading, Notice, Page, ScreenIntro, s, usePalette } from "../../../components/ui";
import { MoreButton, PersonalField } from "../../../components/personal-controls";
import { LibraryAttempt } from "../../../components/library-attempt";
import type { PersonalDraft } from "../../../lib/library-drafts";
import { useLibraryDrafts } from "../../../lib/library-context";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
type LibraryRow = {
  id: string;
  name: string;
  folderId: string | null;
  position: number;
  items: { sets: string | number }[];
  draft: PersonalDraft | undefined;
  source: PersonalRoutine | undefined;
};
type Menu = { kind: "routine" | "folder"; id: string } | null;
export default function PersonalLibraryScreen() {
  const reduced = useReducedMotion(),
    insets = useSafeAreaInsets();
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, library } = useLibraryDrafts();
  const q = useQuery(useCallback(() => client.personalLibrary(), [client]));
  const [search, setSearch] = useState(""),
    [menu, setMenu] = useState<Menu>(null),
    [confirm, setConfirm] = useState(false),
    [rename, setRename] = useState<string | null>(null),
    [newFolder, setNewFolder] = useState<string | null>(null),
    [moving, setMoving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const opening = useRef(false);
  const [openingEditor, setOpeningEditor] = useState(false);
  const offline = state.status === "authenticated" && state.mode === "offline";
  const disabled =
    openingEditor ||
    library.busy ||
    library.blocked ||
    !library.ready ||
    !!library.pending ||
    offline ||
    !q.value ||
    !!q.error;
  const drafts = library.drafts.filter((d) => d.changed),
    snapshot = q.value;
  const routine =
    menu?.kind === "routine" ? snapshot?.routines.find((r) => r.id === menu.id) : undefined;
  const folder =
    menu?.kind === "folder" ? snapshot?.folders.find((f) => f.id === menu.id) : undefined;
  const resetMenu = () => {
    setMenu(null);
    setConfirm(false);
    setRename(null);
    setMoving(false);
  };
  async function mutate(input: PersonalMutation) {
    setError(null);
    try {
      await controller.mutate(input);
      resetMenu();
      q.retry();
    } catch (e) {
      resetMenu();
      setError(e instanceof Error ? e.message : "No pudimos confirmar el cambio.");
      q.retry();
    }
  }
  const operation = (
    op: PersonalMutation["operation"],
    targetId: string,
    expectedRevision: number | null,
    data: unknown,
  ) =>
    mutate({
      version: 1,
      requestId: randomUUID(),
      operation: op,
      targetId,
      expectedRevision,
      data,
    } as PersonalMutation);
  async function create() {
    if (opening.current) return;
    opening.current = true;
    setOpeningEditor(true);
    setError(null);
    try {
      const id = await controller.createDraft();
      router.push({ pathname: "/library/[id]", params: { id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      opening.current = false;
      setOpeningEditor(false);
    }
  }
  async function edit(row: PersonalRoutine) {
    if (opening.current) return;
    opening.current = true;
    setOpeningEditor(true);
    setError(null);
    try {
      await controller.createDraft(row);
      router.push({ pathname: "/library/[id]", params: { id: row.id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      opening.current = false;
      setOpeningEditor(false);
    }
  }
  function reorder(kind: "routine" | "folder", id: string, direction: -1 | 1) {
    if (!snapshot) return;
    const row = snapshot.routines.find((r) => r.id === id),
      folderId = row?.folderId ?? null;
    const entries =
      kind === "folder"
        ? [...snapshot.folders].sort((a, b) => a.position - b.position)
        : snapshot.routines
            .filter((r) => r.folderId === folderId)
            .sort((a, b) => a.position - b.position);
    const index = entries.findIndex((r) => r.id === id),
      to = index + direction;
    if (index < 0 || to < 0 || to >= entries.length) return;
    [entries[index], entries[to]] = [entries[to], entries[index]];
    void operation(
      kind === "folder" ? "folders_reorder" : "routines_reorder",
      snapshot.userId,
      null,
      {
        ...(kind === "routine" ? { folderId } : {}),
        entries: entries.map(({ id, revision }) => ({ id, revision })),
      },
    );
  }
  const orderedMenuRows =
    menu?.kind === "folder"
      ? [...(snapshot?.folders ?? [])].sort((a, b) => a.position - b.position)
      : (snapshot?.routines ?? [])
          .filter((r) => r.folderId === routine?.folderId)
          .sort((a, b) => a.position - b.position);
  const menuIndex = orderedMenuRows.findIndex((r) => r.id === menu?.id);
  const needle = search.trim().toLocaleLowerCase("es");
  const viewRows = (snapshot?.routines ?? [])
    .map<LibraryRow>((row) => {
      const draft = drafts.find((d) => d.id === row.id);
      return {
        id: row.id,
        name: draft?.name || row.name,
        folderId: row.folderId,
        position: row.position,
        items: draft?.items ?? row.items,
        draft,
        source: row,
      };
    })
    .concat(
      drafts
        .filter((d) => !snapshot?.routines.some((r) => r.id === d.id))
        .map((draft, index) => ({
          id: draft.id,
          name: draft.name || "Nueva rutina",
          folderId: snapshot?.folders.some((f) => f.id === draft.folderId) ? draft.folderId : null,
          position: index + 100000,
          items: draft.items,
          draft,
          source: undefined,
        })),
    );
  function rows(folderId: string | null) {
    return viewRows
      .filter((r) => r.folderId === folderId && r.name.toLocaleLowerCase("es").includes(needle))
      .sort((a, b) => a.position - b.position)
      .map((row) => (
        <View
          key={row.id}
          style={{
            borderBottomWidth: 0.5,
            borderColor: p.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${row.draft ? "Retomar borrador" : "Editar rutina"} ${row.name}`}
            disabled={openingEditor || library.busy || library.blocked}
            onPress={() => {
              if (row.draft) router.push({ pathname: "/library/[id]", params: { id: row.id } });
              else if (row.source) void edit(row.source);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 80,
              paddingVertical: 15,
              paddingRight: 8,
              gap: 5,
              backgroundColor: pressed ? p.raised : "transparent",
            })}
          >
            <Text style={[s.label, { color: p.ink, fontSize: 17, fontWeight: "600" }]}>
              {row.name}
            </Text>
            <Text style={[s.caption, { color: row.draft ? p.blue : p.muted }]}>
              {row.draft ? "Borrador · " : ""}
              {row.items.length} ejercicios ·{" "}
              {row.items.reduce(
                (n, item) =>
                  n + (typeof item.sets === "number" ? item.sets : Number(item.sets) || 0),
                0,
              )}{" "}
              series
            </Text>
          </Pressable>
          {row.source ? (
            <MoreButton
              label={`Acciones de rutina ${row.name}`}
              disabled={disabled || !!row.draft}
              onPress={() => {
                resetMenu();
                setMenu({ kind: "routine", id: row.id });
              }}
            />
          ) : null}
        </View>
      ));
  }
  if (!library.ready) return <Loading />;
  return (
    <Page compact>
      <Action label="Volver a Entrenar" quiet onPress={() => router.navigate("/train")} />
      <View style={s.row}>
        <ScreenIntro title="Mis rutinas" />
        <MoreButton
          label="Opciones de biblioteca"
          disabled={disabled}
          onPress={() => setNewFolder(newFolder === null ? "" : null)}
        />
      </View>
      <LibraryAttempt allowDiscard onConfirmed={q.retry} />
      {error && error !== library.error ? <Notice message={error} /> : null}
      {q.error && !offline ? <Notice message={q.error} retry={q.retry} /> : null}
      {offline ? (
        <Text style={[s.caption, { color: p.muted }]}>
          Conecta para consultar la biblioteca completa. Puedes retomar tus borradores.
        </Text>
      ) : null}
      <Action
        label="Nueva rutina"
        icon="plus"
        disabled={openingEditor || library.busy || library.blocked || !!library.pending || offline}
        onPress={() => {
          void create();
        }}
      />
      {newFolder !== null ? (
        <View style={[s.card, { borderColor: p.border, backgroundColor: p.card }]}>
          <PersonalField
            label="Nombre de la carpeta"
            title="Nueva carpeta"
            value={newFolder}
            onChange={setNewFolder}
          />
          <Action
            label="Crear carpeta"
            disabled={disabled || !newFolder.trim()}
            onPress={() => {
              void operation("folder_create", randomUUID(), 0, { name: newFolder }).then(() =>
                setNewFolder(null),
              );
            }}
          />
          <Action label="Cancelar carpeta" quiet onPress={() => setNewFolder(null)} />
        </View>
      ) : null}
      {viewRows.length ? (
        <TextInput
          accessibilityLabel="Buscar mis rutinas"
          placeholder="Buscar rutina"
          placeholderTextColor={p.muted}
          value={search}
          onChangeText={setSearch}
          style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }]}
        />
      ) : null}
      {!viewRows.length && !q.loading && !q.error ? (
        <Text style={[s.body, { color: p.muted }]}>Tus rutinas, a tu manera. Crea la primera.</Text>
      ) : null}
      {rows(null)}
      {snapshot?.folders
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((f) => (
          <View key={f.id} style={{ gap: 4, paddingTop: 10 }}>
            <View style={s.row}>
              <Text style={[s.subheading, { color: p.ink, flex: 1 }]}>{f.name}</Text>
              <MoreButton
                label={`Acciones de carpeta ${f.name}`}
                disabled={disabled}
                onPress={() => {
                  resetMenu();
                  setMenu({ kind: "folder", id: f.id });
                }}
              />
            </View>
            {rows(f.id)}
          </View>
        ))}
      <Modal
        visible={!!menu && !!(routine || folder)}
        transparent
        animationType={reduced ? "none" : "slide"}
        onRequestClose={resetMenu}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }}>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            style={{
              maxHeight: "85%",
              backgroundColor: p.card,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
            }}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20, gap: 10 }}
          >
            {menu && (routine || folder) ? (
              <View style={{ gap: 10 }}>
                <Text style={[s.label, { color: p.ink }]}>{routine?.name ?? folder?.name}</Text>
                {rename !== null ? (
                  <>
                    <PersonalField
                      label="Nuevo nombre de carpeta"
                      value={rename}
                      onChange={setRename}
                    />
                    <Action
                      label="Guardar nombre de carpeta"
                      disabled={disabled || !rename.trim()}
                      onPress={() => {
                        if (folder)
                          void operation("folder_rename", folder.id, folder.revision, {
                            name: rename,
                          });
                      }}
                    />
                  </>
                ) : null}
                {moving && routine ? (
                  <>
                    <Text style={[s.caption, { color: p.muted }]}>Mover a</Text>
                    <Action
                      label="Sin carpeta"
                      secondary
                      disabled={disabled || routine.folderId === null}
                      onPress={() => {
                        void operation("routine_move", routine.id, routine.revision, {
                          folderId: null,
                        });
                      }}
                    />
                    {snapshot?.folders.map((f) => (
                      <Action
                        key={f.id}
                        label={`Mover a ${f.name}`}
                        secondary
                        disabled={disabled || routine.folderId === f.id}
                        onPress={() => {
                          void operation("routine_move", routine.id, routine.revision, {
                            folderId: f.id,
                          });
                        }}
                      />
                    ))}
                  </>
                ) : null}
                {!confirm && rename === null && !moving ? (
                  <>
                    {routine ? (
                      <>
                        <Action
                          label="Duplicar rutina"
                          quiet
                          disabled={disabled}
                          onPress={() => {
                            void operation("routine_copy", randomUUID(), 0, {
                              sourceId: routine.id,
                              sourceRevision: routine.revision,
                              name: routine.name.slice(0, 92) + " (copia)",
                              folderId: routine.folderId,
                            });
                          }}
                        />
                        <Action
                          label="Mover a carpeta"
                          quiet
                          disabled={disabled}
                          onPress={() => setMoving(true)}
                        />
                      </>
                    ) : (
                      <Action
                        label="Renombrar carpeta"
                        quiet
                        disabled={disabled}
                        onPress={() => setRename(folder!.name)}
                      />
                    )}
                    <View style={s.row}>
                      <Action
                        label="Subir"
                        secondary
                        disabled={disabled || menuIndex <= 0}
                        onPress={() => reorder(menu.kind, menu.id, -1)}
                      />
                      <Action
                        label="Bajar"
                        secondary
                        disabled={
                          disabled || menuIndex < 0 || menuIndex >= orderedMenuRows.length - 1
                        }
                        onPress={() => reorder(menu.kind, menu.id, 1)}
                      />
                    </View>
                    <Action
                      label={routine ? "Eliminar rutina" : "Eliminar carpeta"}
                      quiet
                      disabled={disabled}
                      onPress={() => setConfirm(true)}
                    />
                  </>
                ) : null}
                {confirm ? (
                  <>
                    <Text style={[s.body, { color: p.ink }]}>
                      {routine
                        ? "Se eliminará esta rutina. Los entrenamientos que ya realizaste se conservan."
                        : "Se eliminará la carpeta. Sus rutinas quedarán sin carpeta."}
                    </Text>
                    <Action
                      label={
                        routine
                          ? "Confirmar eliminación de rutina"
                          : "Confirmar eliminación de carpeta"
                      }
                      disabled={disabled}
                      onPress={() => {
                        void operation(
                          routine ? "routine_delete" : "folder_delete",
                          menu.id,
                          (routine ?? folder)!.revision,
                          {},
                        );
                      }}
                    />
                  </>
                ) : null}
                <Action label="Cerrar opciones" quiet disabled={library.busy} onPress={resetMenu} />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </Page>
  );
}
