import { useCallback, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Action, Input, Notice, Page, ScreenIntro, s, usePalette } from "../../../components/ui";
import { Avatar, EmptyState, ListRow, SectionHeader, Skeleton } from "../../../ui/display";
import { plural } from "../../../lib/plural";
import { useQuery } from "../../../lib/use-query";
import { useSession } from "../../../lib/session";

/** Ficha de un alumno del coach, de solo lectura, con los datos que ya entrega la lista. */
export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    p = usePalette(),
    [reply, setReply] = useState(""),
    [sending, setSending] = useState(false),
    [replyError, setReplyError] = useState<string | null>(null),
    attempt = useRef<{ id: string; body: string } | null>(null),
    { client, state } = useSession(),
    query = useQuery(useCallback(() => client.students(), [client])),
    activity = useQuery(
      useCallback(() => (id ? client.studentDetail(id) : Promise.resolve(null)), [client, id]),
    );
  if (state.status !== "authenticated") return null;
  const back = (
    <Action label="Volver a mis alumnos" quiet onPress={() => router.navigate("/students")} />
  );
  if (state.session.profile.role !== "coach")
    return (
      <Page compact>
        {back}
        <Notice message="Esta ficha es solo para tu coach." />
      </Page>
    );
  const st = query.value?.students.find((x) => x.id === id);
  const lastDate = st?.lastWorkoutDate?.split("-").reverse().join("/");
  return (
    <Page compact>
      {back}
      {query.error ? <Notice message={query.error} retry={query.retry} /> : null}
      {query.loading && !query.value ? (
        <View accessibilityLabel="Cargando alumno" style={{ gap: 10 }}>
          <Skeleton height={56} />
        </View>
      ) : null}
      {query.value && !st ? (
        <EmptyState title="No encontramos a este alumno" body="Puede que ya no esté activo." />
      ) : null}
      {st ? (
        <>
          <ScreenIntro
            title={st.fullName}
            description="Resumen de su semana. Planificar y comentar sigue en la web."
          />
          <ListRow
            title="Programa"
            subtitle={
              st.week.kind === "active"
                ? `${st.week.programName} · ${st.week.done} de ${plural(st.week.planned, "sesión", "sesiones")}${st.week.deload ? " · descarga" : ""}`
                : st.week.kind === "scheduled"
                  ? "Por comenzar"
                  : st.week.kind === "finished"
                    ? "Programa terminado"
                    : "Sin programa vigente"
            }
            leading={<Avatar name={st.fullName} />}
          />
          <ListRow title="Último entrenamiento" subtitle={lastDate ?? "Aún no entrena"} />
          {st.signals.length ? (
            st.signals.map((x) => <ListRow key={x.kind} title={x.label} subtitle={x.detail} />)
          ) : (
            <ListRow title="Sin avisos" subtitle="Nada que atender por ahora." />
          )}
          {activity.error ? <Notice message={activity.error} retry={activity.retry} /> : null}
          {activity.value ? (
            <>
              <SectionHeader title="Check-in de la semana" />
              {activity.value.checkin ? (
                <ListRow
                  title={`Sueño ${activity.value.checkin.answers.sleep}/5 · Energía ${activity.value.checkin.answers.energy}/5`}
                  subtitle={`Dolor muscular ${activity.value.checkin.answers.soreness}/5 · Motivación ${activity.value.checkin.answers.motivation}/5${activity.value.checkin.answers.note ? ` · ${activity.value.checkin.answers.note}` : ""}`}
                />
              ) : (
                <ListRow title="Sin check-in" subtitle="Aún no lo completa esta semana." />
              )}
              <SectionHeader title="Últimos entrenamientos" />
              {activity.value.workouts.length ? (
                activity.value.workouts.map((w) => (
                  <ListRow
                    key={w.id}
                    title={w.date.split("-").reverse().join("/")}
                    subtitle={plural(w.sets, "serie", "series")}
                  />
                ))
              ) : (
                <ListRow title="Aún no entrena" subtitle="Cuando registre uno, aparecerá aquí." />
              )}
              <SectionHeader title="Conversación reciente" />
              {activity.value.comments.length ? (
                activity.value.comments.map((c) => (
                  <ListRow
                    key={c.id}
                    title={c.authorKind === "student" ? st.fullName : "Tú"}
                    subtitle={c.body}
                  />
                ))
              ) : (
                <ListRow title="Sin comentarios" subtitle="Aún no hay mensajes." />
              )}
              {activity.value.comments.some((c) => c.authorKind === "student") ? (
                <View style={{ gap: 10 }}>
                  <Input
                    accessibilityLabel={`Responder a ${st.fullName}`}
                    placeholder="Escribe tu respuesta"
                    placeholderTextColor={p.muted}
                    value={reply}
                    onChangeText={setReply}
                    maxLength={500}
                    multiline
                    editable={!sending}
                    style={[
                      s.input,
                      { color: p.ink, borderColor: p.control, backgroundColor: p.field },
                    ]}
                  />
                  {replyError ? <Notice message={replyError} /> : null}
                  <Action
                    label={sending ? "Enviando…" : "Enviar respuesta"}
                    disabled={sending || !reply.trim()}
                    onPress={() => {
                      const target = activity.value?.comments.find(
                        (c) => c.authorKind === "student",
                      );
                      const body = reply.trim();
                      if (!target || !body || sending) return;
                      // Un reintento exacto conserva el ID; si cambia el texto, es otro mensaje.
                      if (!attempt.current || attempt.current.body !== body)
                        attempt.current = { id: randomUUID(), body };
                      const current = attempt.current;
                      setSending(true);
                      setReplyError(null);
                      client
                        .replyToStudent(st.id, {
                          id: current.id,
                          workoutId: target.workoutId,
                          body,
                        })
                        .then(() => {
                          attempt.current = null;
                          setReply("");
                          activity.retry();
                        })
                        .catch((e: unknown) =>
                          setReplyError(
                            e instanceof Error
                              ? e.message
                              : "No pudimos enviar tu respuesta. Reintenta.",
                          ),
                        )
                        .finally(() => setSending(false));
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
