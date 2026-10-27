import { TrainingPreferencesProvider } from "../../lib/training-preferences-context";
import { LibraryProvider } from "../../lib/library-context";
import { useReducedMotion } from "../../lib/motion-context";
import { WeekDownloadProvider } from "../../lib/week-context";
import { Stack } from "expo-router";
import { TrainingProvider } from "../../lib/training-context";
import { useSession } from "../../lib/session";
import { usePalette } from "../../components/ui";
import { CommentProvider } from "../../lib/comment-context";
import { WorkoutSyncProvider } from "../../lib/sync-context";
export default function AppLayout() {
  const reduced = useReducedMotion();
  const { state } = useSession(),
    p = usePalette();
  if (state.status !== "authenticated") return null;
  return (
    <TrainingPreferencesProvider key={state.session.profile.id} userId={state.session.profile.id}>
      <LibraryProvider key={state.session.profile.id} userId={state.session.profile.id}>
        <TrainingProvider key={state.session.profile.id} userId={state.session.profile.id}>
          <CommentProvider key={state.session.profile.id} userId={state.session.profile.id}>
            <WeekDownloadProvider key={state.session.profile.id} userId={state.session.profile.id}>
              <WorkoutSyncProvider key={state.session.profile.id} userId={state.session.profile.id}>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: reduced ? "none" : "slide_from_right",
                    animationDuration: reduced ? 0 : 240,
                    contentStyle: { backgroundColor: p.bg },
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="routine/[id]" />
                  <Stack.Screen name="workout/[id]" />
                  <Stack.Screen name="result/[id]" />
                  <Stack.Screen name="progress/[id]" />
                </Stack>
              </WorkoutSyncProvider>
            </WeekDownloadProvider>
          </CommentProvider>
        </TrainingProvider>
      </LibraryProvider>
    </TrainingPreferencesProvider>
  );
}
