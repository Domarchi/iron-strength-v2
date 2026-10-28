import { CorrectionDraftCard } from "./correction-draft-card";
import { ProgressRefresh } from "./progress-refresh";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { router } from "expo-router";
import { FlatList, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { filterTrainingActivity } from "../../../src/domain/training-progress";
import { santiagoDate } from "../../../src/domain/dates";
import { useSession } from "../lib/session";
import { useTraining } from "../lib/training-context";
import { useQuery } from "../lib/use-query";
import { queryPeriod } from "../lib/training-progress-view";
import { Action, Notice, ScreenIntro, s, day, usePalette } from "./ui";
import { ConnectionStatus } from "./connection-status";
import { UnreadComments } from "./unread-comments";
import { CommentDraftCard } from "./comment-draft-card";
import { ProgressChoice } from "./progress-choice";
import { TrainingCalendar } from "./training-calendar";
import { PeriodNavigation } from "./period-navigation";
import { TrainingActivityRow } from "./training-activity-row";
export function TrainingHistory() {
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    { client } = useSession(),
    { training } = useTraining();
  const request = useCallback(() => client.trainingProgress(), [client]),
    q = useQuery(request);
  const [view, setView] = useState<"list" | "calendar">("list"),
    [search, setSearch] = useState(""),
    [source, setSource] = useState<"assigned" | "personal" | "free" | undefined>(),
    [offset, setOffset] = useState(0),
    [anchor, setAnchor] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [filters, setFilters] = useState(false);
  const query = useDeferredValue(search),
    period = q.value ? queryPeriod(anchor ?? q.value.today, "month", offset) : null,
    month = period?.from.slice(0, 7),
    date = selected?.startsWith(`${month}-`) ? selected : undefined;
  const filtered = useMemo(
    () => filterTrainingActivity(q.value?.activity ?? [], { query, sourceKind: source }),
    [q.value, query, source],
  );
  const rows = useMemo(
    () => filterTrainingActivity(filtered, view === "calendar" ? { month, date } : {}),
    [filtered, view, month, date],
  );
  function move(n: number) {
    setOffset((v) => v + n);
    setSelected(null);
  }
  const header = (
    <View style={{ gap: 18 }}>
      <ConnectionStatus />
      <ScreenIntro title="Historial" />
      <CommentDraftCard />
      <CorrectionDraftCard />
      {q.error ? (
        <>
          <Notice message={q.error} retry={q.retry} />
          {q.value ? (
            <Text style={[s.caption, { color: p.muted }]}>Datos sin actualizar</Text>
          ) : null}
        </>
      ) : null}
      {q.loading && !q.value ? (
        <Text style={[s.body, { color: p.muted }]}>Cargando entrenamientos…</Text>
      ) : null}
      {q.value ? (
        <>
          <TextInput
            keyboardAppearance={p.dark ? "dark" : "light"}
            selectionColor={p.blue}
            accessibilityLabel="Buscar en historial"
            placeholder="Buscar rutina o ejercicio"
            placeholderTextColor={p.muted}
            value={search}
            maxLength={200}
            onChangeText={(value) => setSearch(value.slice(0, 200))}
            style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }]}
          />
          <View style={s.row}>
            <View style={{ flexDirection: "row" }}>
              <ProgressChoice
                label="Lista"
                selected={view === "list"}
                onPress={() => setView("list")}
              />
              <ProgressChoice
                label="Calendario"
                selected={view === "calendar"}
                onPress={() => {
                  if (anchor === null && q.value) setAnchor(q.value.today);
                  setView("calendar");
                }}
              />
            </View>
            <Action
              label={source ? "Origen filtrado" : "Origen"}
              quiet
              onPress={() => setFilters((v) => !v)}
            />
          </View>
          {filters ? (
            <View style={[s.row, { justifyContent: "flex-start", gap: 4 }]}>
              {(
                [
                  [undefined, "Todos"],
                  ["assigned", "Coach"],
                  ["personal", "Mis rutinas"],
                  ["free", "Libre"],
                ] as const
              ).map(([value, label]) => (
                <ProgressChoice
                  key={label}
                  label={label}
                  selected={source === value}
                  onPress={() => setSource(value)}
                />
              ))}
            </View>
          ) : null}
          {view === "calendar" && period && month ? (
            <>
              <PeriodNavigation
                label={period.label}
                onPrevious={() => move(-1)}
                onNext={() => move(1)}
              />
              <TrainingCalendar
                month={month}
                activity={filtered}
                selected={date ?? null}
                onSelect={setSelected}
              />
              {date ? (
                <Action label="Ver todo el mes" quiet onPress={() => setSelected(null)} />
              ) : null}
            </>
          ) : null}
          <View style={s.row}>
            <Text style={[s.caption, { color: p.muted }]}>
              {rows.length} {rows.length === 1 ? "resultado" : "resultados"}
              {source ? " · origen filtrado" : ""}
            </Text>
            <ProgressRefresh label="Actualizar historial" busy={q.loading} onPress={q.retry} />
          </View>
        </>
      ) : (
        <ProgressRefresh label="Actualizar historial" busy={q.loading} onPress={q.retry} />
      )}
      <UnreadComments all />
    </View>
  );
  const footer = training.demos.length ? (
    <View style={{ gap: 12, paddingTop: 24 }}>
      <Text style={[s.subheading, { color: p.ink }]}>Pruebas en este dispositivo</Text>
      <Text style={[s.caption, { color: p.muted }]}>
        DEMO · No cuentan para tus resultados reales.
      </Text>
      {training.demos.map((w) => (
        <View key={w.id} style={[s.divider, { borderColor: p.border }]}>
          <Text style={[s.caption, { color: p.blue }]}>
            DEMO · {day(santiagoDate(new Date(w.payload.startedAt)))}
          </Text>
          <Text style={[s.subheading, { color: p.ink }]}>{w.title}</Text>
          <Text style={[s.body, { color: p.muted }]}>
            {w.payload.sets.length} series registradas
          </Text>
          <Action
            label={`Ver resultado demo ${w.title}`}
            secondary
            onPress={() =>
              router.push({ pathname: "/result/[id]", params: { id: w.id, demo: "1" } })
            }
          />
        </View>
      ))}
    </View>
  ) : null;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <FlatList
        testID="history-list"
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <TrainingActivityRow row={item} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer ?? undefined}
        ListEmptyComponent={
          q.value ? (
            <Text style={[s.body, { color: p.muted, paddingVertical: 24 }]}>
              {q.value.activity.length
                ? "No hay entrenamientos para estos filtros."
                : "Aún no tienes entrenamientos guardados en tu cuenta. Puedes probar una demo desde Entrenar."}
            </Text>
          ) : undefined
        }
        contentContainerStyle={{
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: insets.bottom + 28,
        }}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}
