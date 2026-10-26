import { Icon } from "../../../components/icon";
import { useSession } from "../../../lib/session";
import { DownloadedSessions } from "../../../components/downloaded-sessions";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Action, Page, ScreenIntro, SessionMark, s, usePalette } from "../../../components/ui";
import { DEMO_ROUTINES, demoSlug } from "../../../lib/demo";
import { TrainingCard } from "../../../components/training-card";
export default function Train() {
  const p = usePalette(),
    { state } = useSession(),
    offline = state.status === "authenticated" && state.mode === "offline";
  return (
    <Page>
      <ScreenIntro title="Entrenar" />
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
      <View style={{ gap: 6 }}>
        <Text style={[s.subheading, { color: p.ink }]}>Rutinas de ejemplo</Text>
        <Text style={[s.caption, { color: p.muted }]}>Demos locales · no se envían al coach</Text>
      </View>
      <View style={{ gap: 0 }}>
        {DEMO_ROUTINES.map((r) => (
          <Pressable
            key={r.session.id}
            accessibilityRole="button"
            accessibilityLabel={`Ver demo ${r.session.label}`}
            onPress={() => router.push({ pathname: "/routine/[id]", params: { id: demoSlug(r) } })}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 18,
              borderTopWidth: 0.5,
              borderTopColor: p.border,
              backgroundColor: pressed ? p.raised : "transparent",
            })}
          >
            <SessionMark label={r.session.label} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.label, { color: p.ink }]}>{r.session.title}</Text>
              <Text style={[s.caption, { color: p.muted }]}>
                {r.exercises.length} ejercicios ·{" "}
                {r.exercises.reduce((sum, e) => sum + e.prescribed.sets, 0)} series · Demo
              </Text>
            </View>
            <Icon name="arrow" size={18} color={p.muted} />
          </Pressable>
        ))}
      </View>
    </Page>
  );
}
