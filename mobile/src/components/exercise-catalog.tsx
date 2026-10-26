import { randomUUID } from "expo-crypto";
import { addPersonalExercise } from "../../../src/domain/personal-routines";
import { useLibraryDrafts } from "../lib/library-context";
import { useCallback, useMemo, useState, useRef } from "react";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Action, Notice, ScreenIntro, s, usePalette } from "./ui";
import { ConnectionStatus } from "./connection-status";
import { CatalogFilter } from "./catalog-filter";
import { Icon } from "./icon";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
const noEquipment = "__none__";
export function ExerciseCatalog({ pickFor }: { pickFor?: string }) {
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    { client, state } = useSession();
  const { controller, library } = useLibraryDrafts();
  const draft = library.drafts.find((d) => d.id === pickFor);
  const [selected, setSelected] = useState<string[]>([]),
    [addError, setAddError] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [added, setAdded] = useState(false);
  const addingRef = useRef(false);
  const offline = state.status === "authenticated" && state.mode === "offline";
  const request = useCallback(() => {
    if (offline)
      return Promise.reject(new Error("Necesitas conexión para consultar la biblioteca."));
    return client.exerciseCatalog();
  }, [client, offline]);
  const q = useQuery(request);
  const [search, setSearch] = useState(""),
    [muscle, setMuscle] = useState(""),
    [equipment, setEquipment] = useState("");
  const [filter, setFilter] = useState<"muscle" | "equipment" | null>(null);
  const catalog = useMemo(
    () =>
      (q.value?.exercises ?? []).map((exercise) => ({
        ...exercise,
        needle: normalize(`${exercise.name} ${exercise.muscleGroup} ${exercise.equipment ?? ""}`),
      })),
    [q.value],
  );
  const muscles = useMemo(
    () =>
      [...new Set(catalog.map((e) => e.muscleGroup))]
        .sort()
        .map((value) => ({ value, label: value })),
    [catalog],
  );
  const equipmentOptions = useMemo(
    () =>
      [...new Set(catalog.map((e) => e.equipment ?? noEquipment))]
        .sort()
        .map((value) => ({ value, label: value === noEquipment ? "Sin equipo indicado" : value })),
    [catalog],
  );
  const needle = normalize(search);
  const matches =
    offline || q.error
      ? []
      : catalog.filter(
          (exercise) =>
            (!muscle || exercise.muscleGroup === muscle) &&
            (!equipment || (exercise.equipment ?? noEquipment) === equipment) &&
            exercise.needle.includes(needle),
        );
  async function add() {
    if (addingRef.current || !draft) return;
    addingRef.current = true;
    setAdding(true);
    setAddError(null);
    try {
      if (added) await controller.retryStorage();
      else {
        const additions = catalog
          .filter((e) => selected.includes(e.id))
          .map((e) =>
            addPersonalExercise(
              {
                id: e.id,
                name: e.name,
                muscleGroup: e.muscleGroup,
                equipment: e.equipment,
                isBodyweight: e.isBodyweight,
                progressionIncrementKg: e.progressionIncrementKg,
              },
              randomUUID(),
            ),
          );
        if (!additions.length) throw Error("Selecciona al menos un ejercicio.");
        if (draft.items.length + additions.length > 15)
          throw Error("Máximo 15 ejercicios por rutina.");
        try {
          await controller.edit(draft.id, (d) => ({ ...d, items: [...d.items, ...additions] }));
        } finally {
          const current = controller.getSnapshot().drafts.find((d) => d.id === draft.id);
          setAdded(additions.every((item) => current?.items.some((row) => row.id === item.id)));
        }
      }
      router.back();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "No pudimos agregar los ejercicios.");
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <FlatList
        testID="exercise-library-list"
        data={matches}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 28,
        }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 16 }}>
            <ConnectionStatus />
            <Action
              label={pickFor ? "Volver a la rutina" : "Volver a Entrenar"}
              quiet
              onPress={() => (pickFor ? router.back() : router.navigate("/train"))}
            />
            <ScreenIntro title={pickFor ? "Agregar ejercicios" : "Biblioteca"} />
            {addError ? <Notice message={addError} /> : null}
            <TextInput
              accessibilityLabel="Buscar ejercicios"
              placeholder="Buscar ejercicios"
              placeholderTextColor={p.muted}
              keyboardAppearance={p.dark ? "dark" : "light"}
              selectionColor={p.blue}
              autoCorrect={false}
              value={search}
              onChangeText={setSearch}
              style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }]}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Action
                  label={`Músculo: ${muscle || "Todos"}`}
                  accessibilityLabel="Filtrar por músculo"
                  secondary
                  onPress={() => setFilter(filter === "muscle" ? null : "muscle")}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Action
                  label={`Equipo: ${equipmentOptions.find((o) => o.value === equipment)?.label ?? "Todos"}`}
                  accessibilityLabel="Filtrar por equipo"
                  secondary
                  onPress={() => setFilter(filter === "equipment" ? null : "equipment")}
                />
              </View>
            </View>
            {filter === "muscle" ? (
              <CatalogFilter
                label="Músculo"
                options={muscles}
                value={muscle}
                onChange={(value) => {
                  setMuscle(value);
                  setFilter(null);
                }}
              />
            ) : null}
            {filter === "equipment" ? (
              <CatalogFilter
                label="Equipo"
                options={equipmentOptions}
                value={equipment}
                onChange={(value) => {
                  setEquipment(value);
                  setFilter(null);
                }}
              />
            ) : null}
            {offline || q.error ? (
              <Notice
                message={q.error ?? "Necesitas conexión para consultar la biblioteca."}
                retry={offline ? undefined : q.retry}
              />
            ) : null}
            {offline || q.error ? (
              <Text style={[s.caption, { color: p.muted }]}>
                La biblioteca requiere conexión. El catálogo aún no está descargado en este
                dispositivo.
              </Text>
            ) : null}
            {q.loading && !q.value && !offline ? (
              <ActivityIndicator color={p.blue} accessibilityLabel="Cargando biblioteca" />
            ) : null}
            {(q.value && !q.error && !offline) || search || muscle || equipment ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                {q.value && !q.error && !offline ? (
                  <Text style={[s.caption, { color: p.muted }]}>
                    {matches.length} {matches.length === 1 ? "ejercicio" : "ejercicios"}
                  </Text>
                ) : null}
                {search || muscle || equipment ? (
                  <Action
                    label="Limpiar filtros"
                    quiet
                    onPress={() => {
                      setSearch("");
                      setMuscle("");
                      setEquipment("");
                    }}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !q.loading && !q.error && !offline ? (
            <Text style={[s.body, { color: p.muted }]}>
              {catalog.length
                ? "No hay ejercicios con estos filtros."
                : "No hay ejercicios disponibles."}
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole={pickFor ? "checkbox" : "button"}
            aria-checked={pickFor ? selected.includes(item.id) : undefined}
            accessibilityState={
              pickFor
                ? { checked: selected.includes(item.id), disabled: adding || added }
                : undefined
            }
            disabled={!!pickFor && (adding || added)}
            accessibilityLabel={pickFor ? `Seleccionar ${item.name}` : `Ver ejercicio ${item.name}`}
            onPress={() => {
              if (!pickFor) {
                router.push({
                  pathname: "/exercises/[id]",
                  params: { id: item.id, from: "catalog" },
                });
                return;
              }
              setAddError(null);
              if (
                !selected.includes(item.id) &&
                selected.length + (draft?.items.length ?? 0) >= 15
              ) {
                setAddError("Máximo 15 ejercicios por rutina.");
                return;
              }
              setSelected((previous) =>
                previous.includes(item.id)
                  ? previous.filter((id) => id !== item.id)
                  : [...previous, item.id],
              );
            }}
            style={({ pressed }) => ({
              minHeight: 72,
              paddingVertical: 16,
              paddingHorizontal: 4,
              borderTopWidth: 0.5,
              borderTopColor: p.border,
              backgroundColor: pressed ? p.raised : "transparent",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            })}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={[s.label, { color: p.ink }]}>{item.name}</Text>
              <Text style={[s.caption, { color: p.muted }]}>
                {item.muscleGroup} · {item.equipment ?? "Sin equipo indicado"}
              </Text>
            </View>
            {pickFor ? (
              <View
                accessible={false}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 1.5,
                  borderColor: selected.includes(item.id) ? p.button : p.control,
                  backgroundColor: selected.includes(item.id) ? p.button : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected.includes(item.id) ? <Icon name="check" color="#fff" size={16} /> : null}
              </View>
            ) : (
              <Icon name="arrow" color={p.muted} size={18} />
            )}
          </Pressable>
        )}
      />
      {pickFor ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: insets.bottom + 12,
            borderTopWidth: 0.5,
            borderColor: p.border,
            backgroundColor: p.bg,
          }}
        >
          <Action
            label={
              added
                ? "Reintentar guardado local"
                : `Agregar ${selected.length} ${selected.length === 1 ? "ejercicio" : "ejercicios"}`
            }
            busy={adding}
            disabled={
              !draft ||
              library.blocked ||
              !!library.pending ||
              offline ||
              (!added && !selected.length)
            }
            onPress={() => {
              void add();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
