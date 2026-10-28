import { router } from "expo-router";
import { Text, View } from "react-native";
import { workoutRemovalIssueMessage } from "../../../src/lib/workout/removal-draft";
import { useWorkoutRemoval } from "../lib/workout-removal-context";
import { Action, Notice, s, usePalette } from "./ui";
import { EmptyChangeRecovery } from "./empty-change-recovery";
export function WorkoutRemovalCard() {
  const { controller, removal: r } = useWorkoutRemoval(),
    p = usePalette(),
    cause = workoutRemovalIssueMessage(r.pending?.issue ?? null);
  if (!r.pending && !r.error) return null;
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text style={[s.label, { color: p.ink }]}>Eliminación pendiente</Text>
      {cause ? <Text style={[s.body, { color: p.ink }]}>{cause}</Text> : null}
      {r.error && r.error !== cause ? (
        <Notice
          message={r.error}
          retry={
            r.blocked && !r.pending && !r.dirty
              ? () => {
                  void controller.restore().catch(() => {});
                }
              : !r.blocked && r.dirty
                ? () => {
                    void controller.retryStorage().catch(() => {});
                  }
                : undefined
          }
        />
      ) : null}
      {!r.pending && (r.dirty || r.blocked) ? (
        <EmptyChangeRecovery
          kind="eliminación"
          disabled={r.busy || r.paused}
          onReload={() => controller.reloadLocal(true)}
        />
      ) : null}
      {r.pending ? (
        <Action
          label="Revisar eliminación"
          secondary
          disabled={r.busy || r.paused}
          onPress={() =>
            router.navigate({
              pathname: "/remove-result/[id]",
              params: { id: r.pending!.request.workoutId },
            })
          }
        />
      ) : null}
    </View>
  );
}
