import { useLocalSearchParams } from "expo-router";
import { ExerciseCatalog } from "../../../components/exercise-catalog";
export default function AddFreeExercises() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseCatalog key={id} pickForTraining={id} />;
}
