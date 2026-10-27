import { useLocalSearchParams } from "expo-router";
import { useSession } from "../../../lib/session";
import { TypedRepeatPreview } from "../../../components/typed-repeat-preview";
export default function RepeatRecordingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { state } = useSession();
  const account = state.status === "authenticated" ? state.session.profile.id : "";
  return <TypedRepeatPreview key={`${account}:${id}`} id={typeof id === "string" ? id : ""} />;
}
