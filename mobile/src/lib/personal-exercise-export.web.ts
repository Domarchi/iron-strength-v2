import {
  personalExerciseLibrarySchema,
  type PersonalExerciseLibrary,
} from "../../../src/lib/mobile/personal-exercise-contracts";
export async function exportPersonalExerciseFile(value: PersonalExerciseLibrary) {
  const data = personalExerciseLibrarySchema.parse(value);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "iron-strength-ejercicios.json";
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
