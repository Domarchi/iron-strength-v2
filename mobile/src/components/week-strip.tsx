import { Text, View } from "react-native";
import { addDays } from "../../../src/domain/dates";
import { fonts } from "../ui/tokens";
import { usePalette } from "./ui";

const letters = ["L", "M", "M", "J", "V", "S", "D"];
const names = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
type Session = {
  label: string;
  status: "done" | "pending" | "missed" | "upcoming";
  scheduledOn?: string | null;
};

/** Tira de la semana (lunes a domingo): hecho, hoy, previsto y descanso. Solo muestra datos reales de la semana. */
export function WeekStrip({
  weekStart,
  today,
  sessions,
}: {
  weekStart: string;
  today: string;
  sessions: Session[];
}) {
  const p = usePalette();
  return (
    <View
      role="group"
      aria-label="Días de la semana"
      accessibilityLabel="Días de la semana"
      style={{ flexDirection: "row", gap: 6 }}
    >
      {letters.map((letter, i) => {
        const date = addDays(weekStart, i);
        const day = sessions.filter((s) => s.scheduledOn === date);
        const done = day.length > 0 && day.every((s) => s.status === "done");
        const planned = day.length > 0 && !done;
        const isToday = date === today;
        const number = Number(date.slice(8, 10));
        const state = done
          ? `sesión ${day.map((s) => s.label).join(", ")} completada`
          : planned
            ? `sesión ${day.map((s) => s.label).join(", ")} prevista`
            : "sin sesión";
        return (
          <View
            key={date}
            accessible
            accessibilityLabel={`${names[i]} ${number}${isToday ? ", hoy" : ""}: ${state}`}
            style={{ flex: 1, alignItems: "center", gap: 6 }}
          >
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: p.muted }}>
              {letter}
            </Text>
            <View
              style={{
                width: "100%",
                maxWidth: 44,
                aspectRatio: 1,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: done ? p.button : p.raised,
                borderWidth: isToday ? 2 : planned ? 1 : 0,
                borderColor: isToday ? p.blue : p.control,
                borderStyle: planned && !isToday ? "dashed" : "solid",
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 13,
                  color: done ? p.onButton : p.ink,
                }}
              >
                {number}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
