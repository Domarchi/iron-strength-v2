import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  Action,
  Brand,
  Metric,
  Notice,
  Page,
  ScreenIntro,
  day,
  s,
  usePalette,
} from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
export default function Progress() {
  const p = usePalette(),
    { client } = useSession(),
    request = useCallback(() => client.progress(), [client]),
    q = useQuery(request);
  const [search, setSearch] = useState("");
  const rows =
    q.value?.exercises.filter((e) =>
      e.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
    ) ?? [];
  return (
    <Page>
      <Brand />
      <ScreenIntro
        eyebrow="PROGRESO"
        title="Tu progreso"
        description="Tus mejores series de trabajo, confirmadas en tu cuenta."
      />
      {q.error ? <Notice message={q.error} retry={q.retry} /> : null}
      {q.loading ? <Text style={[s.body, { color: p.muted }]}>Cargando marcas…</Text> : null}
      {q.value?.exercises.length ? (
        <>
          <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
            <Text style={[s.caption, { color: p.blue }]}>REGISTROS CONFIRMADOS</Text>
            <Metric
              value={String(q.value.exercises.length)}
              label="ejercicios con registros reales"
            />
          </View>
          <TextInput
            keyboardAppearance={p.dark ? "dark" : "light"}
            selectionColor={p.blue}
            accessibilityLabel="Buscar ejercicio en progreso"
            placeholder="Buscar ejercicio"
            placeholderTextColor={p.muted}
            value={search}
            onChangeText={setSearch}
            style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }]}
          />
        </>
      ) : null}
      {q.value && !q.value.exercises.length ? (
        <Notice message="Tus marcas aparecerán después de guardar tu primer entrenamiento real. Mientras tanto, puedes recorrer las rutinas demo." />
      ) : null}
      {rows.map((e) => (
        <View key={e.exerciseId} style={[s.divider, { borderColor: p.border, paddingBottom: 6 }]}>
          <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
            {e.name}
          </Text>
          <Text style={[s.caption, { color: p.blue }]}>
            {e.isBodyweight ? "MEJOR SERIE SIN CARGA" : "MEJOR PESO REGISTRADO"}
          </Text>
          <View style={s.row}>
            <Text style={[s.heading, s.number, { color: p.ink, fontSize: 38, lineHeight: 46 }]}>
              {e.isBodyweight
                ? `${e.bestReps} reps`
                : `${e.bestWeightKg.toLocaleString("es-CL")} kg`}
            </Text>
            <Text style={[s.caption, { color: p.muted }]}>{e.workoutCount} entrenamientos</Text>
          </View>
          {!e.isBodyweight ? (
            <Text style={[s.body, { color: p.muted }]}>
              1RM estimado: {Math.round(e.bestEstimated1RM * 10) / 10} kg · referencia calculada
            </Text>
          ) : null}
          <Text style={[s.caption, { color: p.muted }]}>
            Último registro: {day(e.lastDate)} · mejores marcas de todo tu historial
          </Text>
        </View>
      ))}
      {search && !rows.length && q.value?.exercises.length ? (
        <Notice message="No encontramos ejercicios con ese nombre." />
      ) : null}
      <Action label="Actualizar progreso" quiet disabled={q.loading} onPress={q.retry} />
    </Page>
  );
}
