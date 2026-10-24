import { santiagoDate } from "../../../../../src/domain/dates";
import { useCallback, useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Action, Brand, Notice, Page, day, s, usePalette } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
import { useTraining } from "../../../lib/training-context";
import type { MobileHistory } from "../../../../../src/lib/mobile/contracts";
export default function History() {
  const p = usePalette(),
    { client } = useSession(),
    { training } = useTraining();
  const request = useCallback(() => client.history(), [client]);
  const q = useQuery(request);
  const [more, setMore] = useState<MobileHistory["items"]>([]),
    [cursor, setCursor] = useState<string | null | undefined>(undefined),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function loadMore() {
    const next = cursor === undefined ? q.value?.nextCursor : cursor;
    if (!next || loading) return;
    setLoading(true);
    try {
      const page = await client.history(next);
      setMore((prev) => [...prev, ...page.items.filter((x) => !prev.some((y) => x.id === y.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar más resultados.");
    } finally {
      setLoading(false);
    }
  }
  const rows = [...(q.value?.items ?? []), ...more].filter(
    (x, i, a) => a.findIndex((y) => y.id === x.id) === i,
  );
  return (
    <Page>
      <Brand />
      <Text style={[s.heading, { color: p.ink }]}>Tu historial</Text>
      <Text style={[s.body, { color: p.muted }]}>
        Cada sesión cuenta. Revisa tus series, esfuerzo y notas.
      </Text>
      {q.error ? <Notice message={q.error} retry={q.retry} /> : null}
      {error ? <Notice message={error} /> : null}
      {q.loading ? (
        <Text style={[s.body, { color: p.muted }]}>Cargando entrenamientos…</Text>
      ) : null}
      {q.value && !rows.length ? (
        <Notice message="Aún no tienes entrenamientos guardados en tu cuenta. Puedes probar una demo desde Entrenar." />
      ) : null}
      {rows.map((w) => (
        <View key={w.id} style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
          <View style={s.row}>
            <Text style={[s.caption, { color: p.blue }]}>
              {day(w.performedOn)} · SESIÓN {w.sessionLabel ?? "LIBRE"}
            </Text>
            <Text style={[s.caption, { color: p.muted }]}>
              {Math.max(1, Math.round(w.durationSeconds / 60))} min
            </Text>
          </View>
          <Text style={[s.subheading, { color: p.ink }]}>
            {w.exerciseCount} ejercicios · {w.workingSets} series
          </Text>
          <Text style={[s.body, { color: p.muted }]}>
            {w.volumeKg.toLocaleString("es-CL")} kg de volumen
            {w.perceivedEffort ? ` · Esfuerzo ${w.perceivedEffort}/10` : ""}
          </Text>
          {w.note ? (
            <Text numberOfLines={2} style={[s.body, { color: p.muted }]}>
              {w.note}
            </Text>
          ) : null}
          <Action
            label={`Ver entrenamiento del ${day(w.performedOn)}`}
            secondary
            onPress={() => router.push({ pathname: "/result/[id]", params: { id: w.id } })}
          />
        </View>
      ))}
      {(cursor === undefined ? q.value?.nextCursor : cursor) ? (
        <Action
          label="Cargar más entrenamientos"
          secondary
          busy={loading}
          onPress={() => {
            void loadMore();
          }}
        />
      ) : null}
      <Action
        label="Actualizar historial"
        secondary
        disabled={q.loading}
        onPress={() => {
          setMore([]);
          setCursor(undefined);
          q.retry();
        }}
      />
      {training.demos.length ? (
        <>
          <Text style={[s.subheading, { color: p.ink }]}>Pruebas en este dispositivo</Text>
          <Text style={[s.body, { color: p.muted }]}>
            DEMO · No cuentan para tus resultados reales.
          </Text>
          {training.demos.map((w) => (
            <View key={w.id} style={[s.card, { backgroundColor: p.tint, borderColor: p.border }]}>
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
        </>
      ) : null}
    </Page>
  );
}
