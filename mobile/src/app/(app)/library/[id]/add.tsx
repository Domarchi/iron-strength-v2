import { useLocalSearchParams } from "expo-router";
import { ExerciseCatalog } from "../../../../components/exercise-catalog";
export default function AddPersonalExercises() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseCatalog pickFor={id} />;
}
