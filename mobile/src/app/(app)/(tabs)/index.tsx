import { useCallback } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import {
  Action,
  Brand,
  Metric,
  Notice,
  Page,
  ScreenIntro,
  SessionMark,
  day,
  s,
  usePalette,
} from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { TrainingCard } from "../../../components/training-card";
import { useQuery } from "../../../lib/use-query";
const statuses = {
  done: "Completada",
  pending: "Pendiente",
  missed: "Pendiente",
  upcoming: "Prevista",
};
export default function Week() {
  const p = usePalette(),
    { client, state } = useSession();
  const request = useCallback(() => client.week(), [client]);
  const query = useQuery(request);
  if (state.status !== "authenticated") return null;
  const person = state.session.profile,
    view = query.value;
  return (
    <Page>
      <View style={s.row}>
        <Brand />
        <Action secondary label="Mi cuenta" onPress={() => router.navigate("/account")} />
      </View>
      <ScreenIntro
        eyebrow="TU ESPACIO"
        title={`Hola, ${person.fullName.trim().split(" ")[0]}`}
        description="Un día más. Una serie mejor."
      />
      <TrainingCard />

      {query.error ? <Notice message={query.error} retry={query.retry} /> : null}
      {query.loading ? (
        <ActivityIndicator color={p.blue} accessibilityLabel="Cargando tu semana" />
      ) : null}
      {view?.kind === "active" ? (
        <>
          <View style={[s.card, { backgroundColor: p.card, borderColor: p.border, gap: 18 }]}>
            <View style={s.row}>
              <Text style={[s.caption, { color: p.blue, letterSpacing: 1.1 }]}>TU PLAN ACTUAL</Text>
              <Text style={[s.caption, { color: p.muted }]}>
                {day(view.weekStart)} — {day(view.weekEnd)}
              </Text>
            </View>
            <Text style={[s.subheading, { color: p.ink, fontSize: 24, lineHeight: 30 }]}>
              {view.program.name}
            </Text>
            <View style={{ flexDirection: "row", gap: 20 }}>
              <Metric
                value={`${view.weekNumber} / ${view.program.weeksCount}`}
                label="semana del plan"
              />
              <Metric
                value={`${view.sessions.filter((x) => x.status === "done").length} / ${view.sessions.length}`}
                label="sesiones hechas"
              />
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Avance semanal"
              accessibilityValue={{
                min: 0,
                max: view.sessions.length,
                now: view.sessions.filter((x) => x.status === "done").length,
              }}
              style={{ flexDirection: "row", gap: 5 }}
            >
              {view.sessions.map((session) => (
                <View
                  key={session.sessionId}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: session.status === "done" ? p.blue : p.raised,
                  }}
                />
              ))}
            </View>
            <Text style={[s.caption, { color: p.muted }]}>
              {view.sessions.filter((x) => x.status === "done").length} de {view.sessions.length}{" "}
              sesiones completadas
            </Text>
          </View>
          <Text style={[s.subheading, { color: p.ink }]}>Tus sesiones</Text>
          {view.sessions.map((session) => (
            <View
              key={session.sessionId}
              style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}
            >
              <View style={s.row}>
                <SessionMark label={session.label} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={[s.caption, { color: p.blue }]}>
                    SESIÓN {session.label}
                    {session.scheduledOn ? ` · ${day(session.scheduledOn)}` : ""}
                  </Text>
                  <Text style={[s.subheading, { color: p.ink }]}>
                    {session.title ?? `Rutina ${session.label}`}
                  </Text>
                </View>
                <Text
                  style={[s.caption, { color: session.status === "done" ? p.success : p.muted }]}
                >
                  {statuses[session.status]}
                </Text>
              </View>
              <Text style={[s.body, { color: p.muted }]}>
                {session.exerciseCount} ejercicios · {session.setCount ?? 0} series
              </Text>
              <Text style={[s.body, { color: p.muted }]}>
                {session.exerciseNames.slice(0, 3).join(" · ")}
                {session.exerciseNames.length > 3 ? "…" : ""}
              </Text>
              <Action
                label={`Ver rutina ${session.label}`}
                secondary={session.status === "done"}
                icon="arrow"
                onPress={() =>
                  router.push({ pathname: "/routine/[id]", params: { id: session.sessionId } })
                }
              />
            </View>
          ))}
          {view.sessions.length === 0 ? (
            <Notice message="Tu coach aún no ha añadido sesiones para esta semana." />
          ) : null}
        </>
      ) : null}
      {view?.kind === "no_program" ? (
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
          <Text style={[s.subheading, { color: p.ink }]}>Tu próximo comienzo</Text>
          <Text style={[s.body, { color: p.muted }]}>
            {person.role === "coach"
              ? "Asígnate un programa desde la planificación web para verlo aquí."
              : "Tu coach aún no te ha asignado un programa. Cuando esté listo, aparecerá aquí."}
          </Text>
        </View>
      ) : null}
      {view?.kind === "scheduled" || view?.kind === "finished" ? (
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
          <Text style={[s.caption, { color: p.blue }]}>
            {view.kind === "scheduled" ? "PRÓXIMO PROGRAMA" : "PROGRAMA TERMINADO"}
          </Text>
          <Text style={[s.subheading, { color: p.ink }]}>{view.program.name}</Text>
          <Text style={[s.body, { color: p.muted }]}>
            {view.kind === "scheduled"
              ? `Empieza el ${day(view.program.startDate)}. Tu rutina estará aquí al comenzar.`
              : "Tu coach puede preparar el siguiente programa desde la web."}
          </Text>
        </View>
      ) : null}
      <Action
        label="Explorar rutinas y entrenar"
        icon="train"
        secondary={view?.kind === "active"}
        onPress={() => router.navigate("/train")}
      />
      <Action label="Actualizar semana" secondary disabled={query.loading} onPress={query.retry} />
    </Page>
  );
}
