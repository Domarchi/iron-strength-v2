import { OfflineWeek } from "../../../components/offline-week";
import { TrainingDownloadCard } from "../../../components/training-download-card";
import { useCallback } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  Action,
  IconAction,
  Notice,
  Page,
  ScreenIntro,
  SessionMark,
  day,
  s,
  usePalette,
} from "../../../components/ui";
import { Icon } from "../../../components/icon";
import { useSession } from "../../../lib/session";
import { useTraining } from "../../../lib/training-context";
import { TrainingCard } from "../../../components/training-card";
import { useQuery } from "../../../lib/use-query";
import { UnreadComments } from "../../../components/unread-comments";
import { CommentDraftCard } from "../../../components/comment-draft-card";
const statuses = {
  done: "Completada",
  pending: "Pendiente",
  missed: "Pendiente",
  upcoming: "Prevista",
};
export default function Week() {
  const { state } = useSession();
  return state.status === "authenticated" && state.mode === "offline" ? (
    <OfflineWeek />
  ) : (
    <OnlineWeek />
  );
}
function OnlineWeek() {
  const p = usePalette(),
    { client, state } = useSession(),
    { training } = useTraining();
  const request = useCallback(() => client.week(), [client]);
  const query = useQuery(request);
  if (state.status !== "authenticated") return null;
  const person = state.session.profile,
    view = query.value;
  const active = view?.kind === "active" ? view : null;
  const next = active?.sessions.find((session) => session.status !== "done");
  const completed = active?.sessions.filter((session) => session.status === "done").length ?? 0;
  return (
    <Page>
      <View style={[s.row, { alignItems: "flex-start", flexWrap: "nowrap" }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <ScreenIntro
            eyebrow={
              active
                ? `Semana ${active.weekNumber} · ${day(active.weekStart)} — ${day(active.weekEnd)}`
                : undefined
            }
            title={`Hola, ${person.fullName.trim().split(" ")[0]}`}
            description={active?.program.name}
          />
        </View>
        <IconAction label="Mi cuenta" icon="account" onPress={() => router.navigate("/account")} />
      </View>
      <TrainingCard />
      <CommentDraftCard />
      <UnreadComments />
      {query.error ? <Notice message={query.error} retry={query.retry} /> : null}
      {query.loading && !view ? (
        <ActivityIndicator color={p.blue} accessibilityLabel="Cargando tu semana" />
      ) : null}
      {active ? (
        <>
          {!training.active && next ? (
            <View
              style={[
                s.card,
                {
                  backgroundColor: p.card,
                  borderColor: p.border,
                  gap: 12,
                },
              ]}
            >
              <View style={s.row}>
                <Text style={[s.caption, { color: p.muted, fontWeight: "500" }]}>
                  SIGUIENTE SESIÓN
                </Text>
                <SessionMark label={next.label} />
              </View>
              <Text
                accessibilityRole="header"
                style={[s.heading, { fontSize: 25, lineHeight: 31, color: p.ink }]}
              >
                {next.title ?? `Rutina ${next.label}`}
              </Text>
              <Text style={[s.body, { color: p.muted }]}>
                {next.exerciseCount} ejercicios · {next.setCount ?? 0} series
                {next.scheduledOn ? ` · ${day(next.scheduledOn)}` : ""}
              </Text>
              <Action
                label="Ver rutina"
                accessibilityLabel={`Ver rutina ${next.label}`}
                icon="arrow"
                onPress={() =>
                  router.push({ pathname: "/routine/[id]", params: { id: next.sessionId } })
                }
              />
            </View>
          ) : null}
          <View style={{ gap: 18 }}>
            <View style={s.row}>
              <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
                Tu semana
              </Text>
              <Text style={[s.caption, { color: p.muted }]}>
                Semana {active.weekNumber} de {active.program.weeksCount}
              </Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Avance semanal"
              accessibilityValue={{
                min: 0,
                max: Math.max(1, active.sessions.length),
                now: completed,
              }}
              style={{ flexDirection: "row", gap: 5 }}
            >
              {active.sessions.map((session) => (
                <View
                  key={session.sessionId}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: session.status === "done" ? p.blue : p.border,
                  }}
                />
              ))}
            </View>
            <Text style={[s.caption, { color: p.muted }]}>
              {completed} de {active.sessions.length} sesiones completadas
            </Text>
          </View>
          <View style={{ gap: 0 }}>
            {active.sessions.map((session) => (
              <Pressable
                key={session.sessionId}
                accessibilityRole="button"
                accessibilityLabel={`Consultar sesión ${session.label}: ${session.title ?? `Rutina ${session.label}`}`}
                onPress={() =>
                  router.push({ pathname: "/routine/[id]", params: { id: session.sessionId } })
                }
                style={({ pressed }) => ({
                  paddingVertical: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderTopWidth: 0.5,
                  borderTopColor: p.border,
                  backgroundColor: pressed ? p.raised : "transparent",
                })}
              >
                <SessionMark label={session.label} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={[s.label, { color: p.ink }]}>
                    {session.title ?? `Rutina ${session.label}`}
                  </Text>
                  <Text
                    style={[s.caption, { color: session.status === "done" ? p.success : p.muted }]}
                  >
                    {statuses[session.status]} · {session.exerciseCount} ejercicios
                    {session.scheduledOn ? ` · ${day(session.scheduledOn)}` : ""}
                  </Text>
                </View>
                <Icon
                  name={session.status === "done" ? "check" : "arrow"}
                  color={session.status === "done" ? p.success : p.muted}
                  size={18}
                />
              </Pressable>
            ))}
          </View>
          {active.sessions.length === 0 ? (
            <Notice message="Tu coach aún no ha añadido sesiones para esta semana." />
          ) : null}
          {active.sessions.length > 0 && !next && !training.active ? (
            <Action
              label="Revisar mis entrenamientos"
              icon="history"
              secondary
              onPress={() => router.navigate("/history")}
            />
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
        secondary={!!active || !!training.active}
        onPress={() => router.navigate("/train")}
      />
      <TrainingDownloadCard
        expected={
          active ? { programId: active.program.id, weekStart: active.weekStart } : undefined
        }
      />
      <Action label="Actualizar semana" quiet disabled={query.loading} onPress={query.retry} />
    </Page>
  );
}
