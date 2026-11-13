import { useCallback } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Action, Notice, Page, ScreenIntro } from "../../components/ui";
import { Badge, EmptyState, ListRow, Skeleton } from "../../ui/display";
import { Avatar } from "../../ui/display";
import { Divider } from "../../ui/display";
import { plural } from "../../lib/plural";
import { useQuery } from "../../lib/use-query";
import { useSession } from "../../lib/session";

/** Alumnos del coach: quién necesita atención. Solo lectura; planificar y comentar sigue en la web. */
export default function Students() {
  const { client, state } = useSession();
  const query = useQuery(useCallback(() => client.students(), [client]));
  if (state.status !== "authenticated") return null;
  if (state.session.profile.role !== "coach")
    return (
      <Page compact>
        <Action label="Volver a Cuenta" quiet onPress={() => router.navigate("/account")} />
        <Notice message="Esta lista es solo para tu coach." />
      </Page>
    );
  const students = query.value?.students ?? [];
  return (
    <Page compact>
      <Action label="Volver a Cuenta" quiet onPress={() => router.navigate("/account")} />
      <ScreenIntro
        title="Mis alumnos"
        description="Quién necesita atención esta semana. Para planificar o comentar usa la web."
      />
      {query.error ? <Notice message={query.error} retry={query.retry} /> : null}
      {query.loading && !query.value ? (
        <View accessibilityLabel="Cargando alumnos" style={{ gap: 10 }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </View>
      ) : null}
      {query.value && students.length === 0 ? (
        <EmptyState
          title="Aún no tienes alumnos activos"
          body="Invita a un alumno desde la web y aparecerá aquí."
        />
      ) : null}
      <View role="group" aria-label="Alumnos" accessibilityLabel="Alumnos" style={{ gap: 0 }}>
        {students.map((st, i) => (
          <View key={st.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={st.fullName}
              subtitle={
                st.week.kind === "active"
                  ? `${st.week.programName} · ${st.week.done} de ${plural(st.week.planned, "sesión", "sesiones")}${
                      st.lastWorkoutDate
                        ? ` · último ${st.lastWorkoutDate.split("-").reverse().slice(0, 2).join("/")}`
                        : ""
                    }`
                  : st.week.kind === "scheduled"
                    ? "Programa por comenzar"
                    : "Sin programa vigente"
              }
              leading={<Avatar name={st.fullName} />}
              trailing={
                st.signals.length ? (
                  <Badge label={plural(st.signals.length, "aviso", "avisos")} tone="accent" />
                ) : null
              }
              accessibilityLabel={`${st.fullName}. ${
                st.signals.length ? st.signals.map((x) => x.label).join(". ") : "Sin avisos"
              }`}
            />
          </View>
        ))}
      </View>
    </Page>
  );
}
