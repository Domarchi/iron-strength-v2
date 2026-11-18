import { Text, View } from "react-native";
import type { MobileAchievements } from "../../../src/lib/mobile/contracts";
import { fonts } from "../ui/tokens";
import { plural } from "../lib/plural";
import { s, usePalette } from "./ui";

/**
 * Racha de semanas cumplidas, entrenamientos y logros reales del alumno.
 * No se muestra mientras no haya nada que contar: sin ceros ni métricas inventadas.
 */
export function HomeStats({ data }: { data: MobileAchievements }) {
  const p = usePalette();
  if (data.workoutCount === 0 && data.streak.current === 0 && data.earned.length === 0) return null;
  const cells = [
    {
      label: "Racha",
      value: String(data.streak.current),
      unit: data.streak.current === 1 ? "semana" : "semanas",
      description: `${plural(data.streak.current, "semana cumplida", "semanas cumplidas")} seguidas; la mejor fue de ${data.streak.longest}`,
    },
    {
      label: "Entrenamientos",
      value: String(data.workoutCount),
      unit: "",
      description: plural(data.workoutCount, "entrenamiento guardado", "entrenamientos guardados"),
    },
    {
      label: "Logros",
      value: String(data.earned.length),
      unit: "",
      description: plural(data.earned.length, "logro obtenido", "logros obtenidos"),
    },
  ];
  return (
    <View
      role="group"
      aria-label="Tu constancia"
      accessibilityLabel="Tu constancia"
      style={{ flexDirection: "row", gap: 10 }}
    >
      {cells.map((c) => (
        <View
          key={c.label}
          accessible
          accessibilityLabel={`${c.label}: ${c.description}`}
          style={{
            flex: 1,
            gap: 2,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: p.border,
            backgroundColor: p.card,
          }}
        >
          <Text style={[s.caption, { color: p.muted, fontFamily: fonts.bodySemi, fontSize: 11 }]}>
            {c.label.toUpperCase()}
          </Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: p.ink }}>
            {c.value}
            {c.unit ? (
              <Text style={{ fontFamily: fonts.body, fontSize: 12, color: p.muted }}>
                {" "}
                {c.unit}
              </Text>
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );
}
