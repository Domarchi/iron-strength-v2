import { useCallback, useMemo, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Action, Notice, ScreenIntro, s, usePalette } from "../../../components/ui";
import { ConnectionStatus } from "../../../components/connection-status";
import { CatalogFilter } from "../../../components/catalog-filter";
import { Icon } from "../../../components/icon";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
const noEquipment = "__none__";
export default function ExerciseLibrary() {
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    { client, state } = useSession();
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
            <Action label="Volver a Entrenar" quiet onPress={() => router.navigate("/train")} />
            <ScreenIntro title="Biblioteca" />
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
            accessibilityRole="button"
            accessibilityLabel={`Ver ejercicio ${item.name}`}
            onPress={() =>
              router.push({ pathname: "/exercises/[id]", params: { id: item.id, from: "catalog" } })
            }
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
            <Icon name="arrow" color={p.muted} size={18} />
          </Pressable>
        )}
      />
    </View>
  );
}
