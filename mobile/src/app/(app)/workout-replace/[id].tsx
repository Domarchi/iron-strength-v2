import { useLocalSearchParams } from "expo-router";
import { ExerciseCatalog } from "../../../components/exercise-catalog";
export default function ReplaceWorkoutExercise() {
  const { id, rowId } = useLocalSearchParams<{ id: string; rowId: string }>();
  return <ExerciseCatalog key={`${id}:${rowId}`} pickForTraining={id} replaceId={rowId} />;
}
