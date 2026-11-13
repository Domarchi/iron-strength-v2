import { useCallback } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import {
  ACHIEVEMENT_KINDS,
  achievementInfo,
  progressToward,
} from "../../../../src/domain/achievements";
import { Action, Page, ScreenIntro } from "../../components/ui";
import { Banner } from "../../ui/feedback";
import { Badge, Divider, ListRow, ProgressRing, Skeleton } from "../../ui/display";
import { Txt } from "../../ui/text";
import { useQuery } from "../../lib/use-query";
import { useSession } from "../../lib/session";

const date = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Santiago",
});

/** Logros obtenidos (con fecha) y los que faltan con su condición y avance real. */
export default function Achievements() {
  const { client, state } = useSession();
  const query = useQuery(useCallback(() => client.achievements(), [client]));
  if (state.status !== "authenticated") return null;
  const data = query.value;
  const byKind = new Map((data?.earned ?? []).map((a) => [a.kind, a]));
  // La API no entrega récords: el logro «Primer récord» solo se marca cuando ya fue obtenido.
  const stats = {
    workoutCount: data?.workoutCount ?? 0,
    longestStreak: data?.streak.longest ?? 0,
    recordCount: byKind.has("first_record") ? 1 : 0,
  };
  return (
    <Page compact>
      <Action label="Volver a Cuenta" quiet onPress={() => router.navigate("/account")} />
      <ScreenIntro
        title="Logros"
        description={
          data
            ? `${data.earned.length} de ${ACHIEVEMENT_KINDS.length} obtenidos. Son permanentes: no se pierden.`
            : undefined
        }
      />
      {query.error ? (
        <Banner
          tone="danger"
          message={query.error}
          action={{ label: "Reintentar", onPress: query.retry }}
        />
      ) : null}
      {query.loading && !data ? (
        <View accessibilityLabel="Cargando logros" style={{ gap: 10 }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </View>
      ) : null}
      {data ? (
        <View role="group" aria-label="Lista de logros" accessibilityLabel="Lista de logros">
          {ACHIEVEMENT_KINDS.map((kind, i) => {
            const info = achievementInfo(kind),
              got = byKind.get(kind),
              progress = got ? null : progressToward(kind, stats);
            return (
              <View key={kind}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={info.title}
                  subtitle={
                    got
                      ? `Obtenido el ${date.format(new Date(got.earnedAt))}`
                      : progress
                        ? `${info.condition} Llevas ${progress.current} de ${progress.target}.`
                        : info.condition
                  }
                  accessibilityLabel={`${info.title}. ${got ? "Obtenido" : "Pendiente"}`}
                  leading={
                    progress ? (
                      <ProgressRing
                        value={progress.current / progress.target}
                        size={36}
                        stroke={4}
                        label={`${info.title}: ${progress.current} de ${progress.target}`}
                      />
                    ) : undefined
                  }
                  trailing={
                    got ? <Badge label="Obtenido" tone="ok" /> : <Badge label="Pendiente" />
                  }
                />
              </View>
            );
          })}
        </View>
      ) : null}
      <Txt variant="caption" muted>
        Los logros se otorgan al guardar un entrenamiento.
      </Txt>
    </Page>
  );
}
