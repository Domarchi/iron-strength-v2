import { useCallback } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Action, Notice, Page, ScreenIntro } from "../../../components/ui";
import { Avatar, EmptyState, ListRow, Skeleton } from "../../../ui/display";
import { plural } from "../../../lib/plural";
import { useQuery } from "../../../lib/use-query";
import { useSession } from "../../../lib/session";

/** Ficha de un alumno del coach, de solo lectura, con los datos que ya entrega la lista. */
export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { client, state } = useSession(),
    query = useQuery(useCallback(() => client.students(), [client]));
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
        </>
      ) : null}
    </Page>
  );
}
