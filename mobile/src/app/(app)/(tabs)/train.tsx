import { TrainingDownloadCard } from "../../../components/training-download-card";
import { FreeStart } from "../../../components/free-start";
import { Icon } from "../../../components/icon";
import { useSession } from "../../../lib/session";
import { DownloadedSessions } from "../../../components/downloaded-sessions";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Action, Page, ScreenIntro, s, usePalette } from "../../../components/ui";
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
      <FreeStart />
      <TrainingDownloadCard />
      <Action label="Mis rutinas" icon="train" onPress={() => router.push("/library")} />
      <Action
        label="Biblioteca de ejercicios"
        secondary
        icon="train"
        onPress={() => router.push("/exercises")}
      />
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
      <View style={{ gap: 12 }}>
        {DEMO_ROUTINES.map((r) => (
          <Pressable
            key={r.session.id}
            accessibilityRole="button"
            accessibilityLabel={`Ver demo ${r.session.label}`}
            onPress={() => router.push({ pathname: "/routine/[id]", params: { id: demoSlug(r) } })}
            style={({ pressed }) => ({
              gap: 12,
              padding: 16,
              borderRadius: 10,
              borderWidth: 0.5,
              borderColor: p.border,
              backgroundColor: pressed ? p.raised : p.card,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={[s.label, { color: p.ink, flex: 1, fontSize: 17, fontWeight: "600" }]}>
                {r.session.title}
              </Text>
              <Icon name="train" size={22} color={p.blue} />
            </View>
            <Text style={[s.caption, { color: p.muted }]}>
              {r.exercises.length} ejercicios ·{" "}
              {r.exercises.reduce((sum, e) => sum + e.prescribed.sets, 0)} series
            </Text>
            <Text numberOfLines={3} style={[s.body, { color: p.muted, lineHeight: 24 }]}>
              {r.exercises
                .slice(0, 3)
                .map((e) => `${e.prescribed.sets} × ${e.name}`)
                .join("\n")}
            </Text>
            <View
              style={{
                minHeight: 44,
                borderRadius: 6,
                backgroundColor: p.tint,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[s.buttonText, { color: p.blue }]}>Ver rutina {r.session.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Page>
  );
}
