import { workoutCorrectionIssueMessage } from "../../../src/lib/workout/correction-draft";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useCorrectionDraft } from "../lib/correction-context";
import { Action, Notice, s, usePalette } from "./ui";
import { EmptyChangeRecovery } from "./empty-change-recovery";
export function CorrectionDraftCard() {
  const { controller, correction: c } = useCorrectionDraft(),
    p = usePalette(),
    cause = workoutCorrectionIssueMessage(c.pending?.issue ?? null),
    protectedMemory = !!(c.dirty || c.draft?.changed || c.pending);
  if (!c.draft?.changed && !c.pending && !c.error) return null;
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text style={[s.label, { color: p.ink }]}>
        {c.pending ? "Corrección sin confirmar" : "Corrección pendiente"}
      </Text>
      {cause ? <Text style={[s.body, { color: p.ink }]}>{cause}</Text> : null}
      {c.error && c.error !== cause ? (
        <Notice
          message={c.error}
          retry={
            c.blocked
              ? protectedMemory
                ? undefined
                : () => {
                    void controller.restore().catch(() => {});
                  }
              : c.dirty
                ? () => {
                    void controller.retryStorage().catch(() => {});
                  }
                : undefined
          }
        />
      ) : null}
      <Text style={[s.caption, { color: p.muted }]}>
        {c.dirty
          ? "Cambios pendientes de guardar en este dispositivo"
          : c.pending
            ? "Pendiente de confirmar en el servidor"
            : "Guardado en este dispositivo"}
      </Text>
      {!c.draft && (c.dirty || c.blocked) ? (
        <EmptyChangeRecovery
          kind="corrección"
          disabled={c.busy || c.paused}
          onReload={() => controller.reloadLocal(true)}
        />
      ) : null}
      {c.draft ? (
        <Action
          label="Retomar corrección"
          secondary
          disabled={c.busy || c.paused}
          onPress={() =>
            router.navigate({
              pathname: "/correct-result/[id]",
              params: { id: c.draft!.base.workout.id },
            })
          }
        />
      ) : null}
    </View>
  );
}
