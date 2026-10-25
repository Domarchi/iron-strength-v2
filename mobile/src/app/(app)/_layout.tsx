import { WeekDownloadProvider } from "../../lib/week-context";
import { Stack } from "expo-router";
import { TrainingProvider } from "../../lib/training-context";
import { useSession } from "../../lib/session";
import { usePalette } from "../../components/ui";
import { CommentProvider } from "../../lib/comment-context";
export default function AppLayout() {
  const { state } = useSession(),
    p = usePalette();
  if (state.status !== "authenticated") return null;
  return (
    <TrainingProvider key={state.session.profile.id} userId={state.session.profile.id}>
      <CommentProvider key={state.session.profile.id} userId={state.session.profile.id}>
        <WeekDownloadProvider key={state.session.profile.id} userId={state.session.profile.id}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="routine/[id]" />
            <Stack.Screen name="workout/[id]" />
            <Stack.Screen name="result/[id]" />
            <Stack.Screen name="progress/[id]" />
          </Stack>
        </WeekDownloadProvider>
      </CommentProvider>
    </TrainingProvider>
  );
}
