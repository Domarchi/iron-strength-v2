import { Text, View } from "react-native";
import { exerciseGuide, type GuideInput } from "../../../src/domain/exercise-guide";
import { fonts } from "../ui/tokens";
import { s, usePalette } from "./ui";

/** «Cómo ejecutarlo»: guía breve y general del ejercicio (spec 012, T247). */
export function ExerciseGuideCard({ exercise }: { exercise: GuideInput }) {
  const p = usePalette();
  const guide = exerciseGuide(exercise);
  return (
    <View
      accessible={false}
      style={{
        gap: 8,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: p.border,
        backgroundColor: p.card,
      }}
    >
      <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
        Cómo ejecutarlo
      </Text>
      <Text style={[s.body, { color: p.muted }]}>{guide.summary}</Text>
      {guide.steps.map((step, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8 }}>
          <Text style={[s.body, { color: p.blue, fontFamily: fonts.bodyBold, width: 18 }]}>
            {i + 1}.
          </Text>
          <Text style={[s.body, { color: p.ink, flex: 1 }]}>{step}</Text>
        </View>
      ))}
      <Text style={[s.caption, { color: p.muted }]}>Evita: {guide.avoid}</Text>
      <Text style={[s.caption, { color: p.muted }]}>
        Guía general. Sigue las indicaciones de tu coach y detente si sientes dolor.
      </Text>
    </View>
  );
}
