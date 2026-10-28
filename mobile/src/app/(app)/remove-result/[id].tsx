import { useLocalSearchParams } from "expo-router";
import { WorkoutRemovalScreen } from "../../../components/workout-removal-screen";
export default function RemoveResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkoutRemovalScreen key={id} id={id} />;
}
