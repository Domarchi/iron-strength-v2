import { Pressable, Text, View } from "react-native";
import type { MobileWeek } from "../../../src/lib/mobile/contracts";
import { s, usePalette } from "./ui";

export function HomeHeading({ fullName, onAccount }: { fullName: string; onAccount: () => void }) {
  const p = usePalette();
  const first = fullName.trim().split(" ")[0];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 7 }}>
        <Text style={[s.caption, { color: p.muted }]}>{`Hola, ${first}`}</Text>
        <Text accessibilityRole="header" style={[s.heading, { color: p.ink }]}>
          Tu semana
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mi cuenta"
        onPress={onAccount}
        style={({ pressed }) => ({
          width: 48,
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 24,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: p.raised,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[s.label, { color: p.ink }]}>
            {Array.from(first)[0]?.toUpperCase() ?? ""}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export function WeeklyProgress({ week }: { week: Extract<MobileWeek, { kind: "active" }> }) {
  const p = usePalette();
  const completed = week.sessions.filter((session) => session.status === "done").length;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Text style={[s.caption, { color: p.muted, flex: 1 }]}>
          {week.program.name} · semana {week.weekNumber} de {week.program.weeksCount}
        </Text>
        <Text style={[s.caption, s.number, { color: p.ink }]}>
          {week.sessions.length ? `${completed} / ${week.sessions.length}` : "Sin sesiones"}
        </Text>
      </View>
      {week.sessions.length ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Avance semanal"
          accessibilityValue={{ min: 0, max: week.sessions.length, now: completed }}
          aria-valuemin={0}
          aria-valuemax={week.sessions.length}
          aria-valuenow={completed}
          style={{ flexDirection: "row", gap: 5 }}
        >
          {week.sessions.map((session) => (
            <View
              key={session.sessionId}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: session.status === "done" ? p.blue : p.border,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
