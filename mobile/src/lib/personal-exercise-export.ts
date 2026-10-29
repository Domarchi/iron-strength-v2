import { Share } from "react-native";
import {
  personalExerciseLibrarySchema,
  type PersonalExerciseLibrary,
} from "../../../src/lib/mobile/personal-exercise-contracts";
export async function exportPersonalExerciseFile(value: PersonalExerciseLibrary) {
  const data = personalExerciseLibrarySchema.parse(value);
  await Share.share({
    title: "Iron Strength · Mis ejercicios",
    message: JSON.stringify(data, null, 2),
  });
}
