import { WorkoutRemovalProvider } from "../../lib/workout-removal-context";
import { CorrectionProvider } from "../../lib/correction-context";
import { TrainingPreferencesProvider } from "../../lib/training-preferences-context";
import { PersonalExerciseProvider } from "../../lib/personal-exercise-context";
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
      <PersonalExerciseProvider key={state.session.profile.id} userId={state.session.profile.id}>
        <LibraryProvider key={state.session.profile.id} userId={state.session.profile.id}>
          <TrainingProvider key={state.session.profile.id} userId={state.session.profile.id}>
            <CommentProvider key={state.session.profile.id} userId={state.session.profile.id}>
              <WeekDownloadProvider
                key={state.session.profile.id}
                userId={state.session.profile.id}
              >
                <WorkoutSyncProvider
                  key={state.session.profile.id}
                  userId={state.session.profile.id}
                >
                  <CorrectionProvider
                    key={state.session.profile.id}
                    userId={state.session.profile.id}
                  >
                    <WorkoutRemovalProvider
                      key={state.session.profile.id}
                      userId={state.session.profile.id}
                    >
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
                        <Stack.Screen name="correct-result/[id]" />
                        <Stack.Screen name="remove-result/[id]" />
                        <Stack.Screen name="progress/[id]" />
                      </Stack>
                    </WorkoutRemovalProvider>
                  </CorrectionProvider>
                </WorkoutSyncProvider>
              </WeekDownloadProvider>
            </CommentProvider>
          </TrainingProvider>
        </LibraryProvider>
      </PersonalExerciseProvider>
    </TrainingPreferencesProvider>
  );
}
