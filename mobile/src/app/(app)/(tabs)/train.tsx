import { useSession } from "../../../lib/session";
import { DownloadedSessions } from "../../../components/downloaded-sessions";
import { router } from "expo-router";
import { Text, View } from "react-native";
import {
  Action,
  Brand,
  Page,
  ScreenIntro,
  SessionMark,
  s,
  usePalette,
} from "../../../components/ui";
import { DEMO_ROUTINES, demoSlug } from "../../../lib/demo";
import { TrainingCard } from "../../../components/training-card";
export default function Train() {
  const p = usePalette(),
    { state } = useSession(),
    offline = state.status === "authenticated" && state.mode === "offline";
  return (
    <Page>
      <Brand />
      <ScreenIntro
        eyebrow="ENTRENAR"
        title="Elige tu sesión"
        description="Revisa tu semana o explora el registro con una rutina de ejemplo."
      />
      <TrainingCard />
      {offline ? <DownloadedSessions /> : null}
      <View
        style={[
          s.card,
          {
            backgroundColor: p.card,
            borderColor: p.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[s.label, { color: p.ink }]}>Tu programa</Text>
          <Text style={[s.caption, { color: p.muted }]}>Asignado por tu coach</Text>
        </View>
        <Action
          label="Mi semana"
          accessibilityLabel="Ir a mi semana"
          icon="arrow"
          secondary
          onPress={() => router.navigate("/")}
        />
      </View>
      <Text style={[s.subheading, { color: p.ink }]}>Prueba la experiencia</Text>
      <Text style={[s.body, { color: p.muted }]}>
        Tres sesiones para probar el registro. No son tu programa personal.
      </Text>
      {DEMO_ROUTINES.map((r) => (
        <View
          key={r.session.id}
          style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}
        >
          <View style={s.row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              <SessionMark label={r.session.label} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[s.caption, { color: p.blue }]}>DEMO · SESIÓN {r.session.label}</Text>
                <Text style={[s.caption, { color: p.muted }]}>
                  {r.exercises.length} ejercicios ·{" "}
                  {r.exercises.reduce((sum, e) => sum + e.prescribed.sets, 0)} series
                </Text>
              </View>
            </View>
          </View>
          <Text style={[s.subheading, { color: p.ink }]}>{r.session.title}</Text>
          <Text style={[s.body, { color: p.muted }]}>
            {r.exercises.map((e) => e.name).join(" · ")}
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>
            {r.session.label === "B" ? "Incluye superserie y alternativa" : "Descansos incluidos"}
          </Text>
          <Action
            label={`Ver demo ${r.session.label}`}
            secondary
            icon="arrow"
            onPress={() => router.push({ pathname: "/routine/[id]", params: { id: demoSlug(r) } })}
          />
        </View>
      ))}
    </Page>
  );
}
