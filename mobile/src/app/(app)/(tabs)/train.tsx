import { router } from "expo-router";
import { Text, View } from "react-native";
import { Action, Brand, Page, s, usePalette } from "../../../components/ui";
import { DEMO_ROUTINES, demoSlug } from "../../../lib/demo";
import { TrainingCard } from "../../../components/training-card";
export default function Train() {
  const p = usePalette();
  return (
    <Page>
      <Brand />
      <Text style={[s.heading, { color: p.ink }]}>Vamos a entrenar</Text>
      <TrainingCard />
      <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
        <Text style={[s.subheading, { color: p.ink }]}>Tu programa</Text>
        <Text style={[s.body, { color: p.muted }]}>
          Las rutinas que tu coach te asigna están en Mi semana.
        </Text>
        <Action label="Ir a mi semana" secondary onPress={() => router.navigate("/")} />
      </View>
      <Text style={[s.subheading, { color: p.ink }]}>Prueba la experiencia</Text>
      <Text style={[s.body, { color: p.muted }]}>
        Rutina de ejemplo de tres días. Puedes registrar series, usar el descanso y ver el resumen.
        Es una demostración; no es tu programa personal.
      </Text>
      {DEMO_ROUTINES.map((r) => (
        <View
          key={r.session.id}
          style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}
        >
          <View style={s.row}>
            <Text style={[s.caption, { color: p.blue }]}>DEMO · SESIÓN {r.session.label}</Text>
            <Text style={[s.caption, { color: p.muted }]}>{r.exercises.length} ejercicios</Text>
          </View>
          <Text style={[s.subheading, { color: p.ink }]}>{r.session.title}</Text>
          <Text style={[s.body, { color: p.muted }]}>
            {r.exercises.map((e) => e.name).join(" · ")}
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>
            {r.exercises.reduce((sum, e) => sum + e.prescribed.sets, 0)} series ·{" "}
            {r.session.label === "B" ? "Superserie y alternativa" : "Descansos incluidos"}
          </Text>
          <Action
            label={`Ver demo ${r.session.label}`}
            secondary
            onPress={() => router.push({ pathname: "/routine/[id]", params: { id: demoSlug(r) } })}
          />
        </View>
      ))}
    </Page>
  );
}
