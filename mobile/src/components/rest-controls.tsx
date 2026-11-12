import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Action, s, usePalette } from "./ui";
import { formatClock } from "../../../src/domain/rest-timer";
import { ProgressRing } from "../ui/display";
import { tap } from "../lib/haptics";

/** A layout sibling of the scroll view: visible without covering a set or the keyboard. */
export function RestControls({
  seconds,
  totalSeconds,
  onAdjust,
  onSkip,
}: {
  seconds: number;
  totalSeconds: number;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
}) {
  const p = usePalette(),
    insets = useSafeAreaInsets();
  const previous = useRef(seconds);
  useEffect(() => {
    // Aviso táctil al terminar el descanso (no al abrir la pantalla con 0).
    if (previous.current > 0 && seconds === 0) tap("success");
    previous.current = seconds;
  }, [seconds]);
  return (
    <View
      style={{
        backgroundColor: p.card,
        borderTopWidth: 0.5,
        borderTopColor: p.border,
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom, 10),
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 520,
          alignSelf: "center",
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restar 15 segundos"
          onPress={() => onAdjust(-15)}
          style={({ pressed }) => ({
            minWidth: 48,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor: pressed ? p.raised : "transparent",
          })}
        >
          <Text style={[s.label, { color: p.blue }]}>−15</Text>
        </Pressable>
        <ProgressRing
          value={totalSeconds > 0 ? seconds / totalSeconds : 0}
          size={36}
          stroke={4}
          label={`Descanso: quedan ${seconds} segundos de ${totalSeconds}`}
        />
        <View style={{ flex: 1, minWidth: 110, gap: 0, alignItems: "center" }}>
          <Text style={[s.caption, { color: p.muted, fontSize: 11 }]}>Descanso</Text>
          <Text
            accessibilityLabel="Tiempo de descanso restante"
            style={[s.number, { fontSize: 23, lineHeight: 28, color: p.ink }]}
          >
            {formatClock(seconds)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sumar 15 segundos"
          onPress={() => onAdjust(15)}
          style={({ pressed }) => ({
            minWidth: 48,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor: pressed ? p.raised : "transparent",
          })}
        >
          <Text style={[s.label, { color: p.blue }]}>+15</Text>
        </Pressable>
        <View style={{ flexGrow: 1, minWidth: 76, maxWidth: "100%" }}>
          <Action label="Saltar" accessibilityLabel="Omitir descanso" onPress={onSkip} />
        </View>
      </View>
      <View
        testID="rest-progress"
        style={{
          height: 3,
          backgroundColor: p.border,
          borderRadius: 2,
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
          overflow: "hidden",
          marginTop: 4,
        }}
      >
        <View
          style={{
            height: 3,
            backgroundColor: p.blue,
            width: `${Math.max(0, Math.min(1, seconds / Math.max(1, totalSeconds))) * 100}%`,
          }}
        />
      </View>
    </View>
  );
}
