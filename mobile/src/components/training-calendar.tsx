import { Text, View, Pressable } from "react-native";
import { trainingCalendar, type TrainingActivity } from "../../../src/domain/training-progress";
import { s, usePalette } from "./ui";
const weekdays = ["L", "M", "M", "J", "V", "S", "D"];
const readable = (date: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
export function TrainingCalendar({
  month,
  activity,
  selected,
  onSelect,
}: {
  month: string;
  activity: TrainingActivity[];
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const p = usePalette(),
    calendar = trainingCalendar(month, activity);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row" }}>
        {weekdays.map((d, i) => (
          <View key={i} style={{ width: "14.285714%", alignItems: "center", paddingVertical: 6 }}>
            <Text accessible={false} style={[s.caption, { color: p.muted }]}>
              {d}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {calendar.days.map((d) => (
          <Pressable
            key={d.date}
            disabled={!d.inMonth}
            accessibilityRole="button"
            accessibilityLabel={`${readable(d.date)} · ${d.workoutIds.length} ${d.workoutIds.length === 1 ? "entrenamiento" : "entrenamientos"}`}
            accessibilityState={{ selected: selected === d.date, disabled: !d.inMonth }}
            aria-pressed={selected === d.date}
            onPress={() => onSelect(selected === d.date ? null : d.date)}
            style={{
              width: "14.285714%",
              minWidth: 44,
              minHeight: 52,
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              opacity: d.inMonth ? 1 : 0.35,
            }}
          >
            <View
              style={{
                width: 36,
                minHeight: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected === d.date ? p.button : "transparent",
              }}
            >
              <Text style={[s.body, s.number, { color: selected === d.date ? "#fff" : p.ink }]}>
                {Number(d.date.slice(-2))}
              </Text>
            </View>
            <View
              style={{
                height: 5,
                width: d.workoutIds.length > 1 ? 10 : 5,
                borderRadius: 3,
                backgroundColor: d.workoutIds.length ? p.blue : "transparent",
              }}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
