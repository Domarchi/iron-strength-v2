import { useLocalSearchParams } from "expo-router";
import { WorkoutCorrectionEditor } from "../../../components/workout-correction-editor";
export default function CorrectResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkoutCorrectionEditor key={id} id={id} />;
}
