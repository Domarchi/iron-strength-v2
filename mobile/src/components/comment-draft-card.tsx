import { useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Action, Notice, s, usePalette } from "./ui";
import { useCommentDraft } from "../lib/comment-context";
type Props = { allowDiscard?: boolean; showResume?: boolean };
export function CommentDraftCard(props: Props) {
  const context = useCommentDraft();
  if (!context.draft.record && !context.draft.error) return null;
  return <DraftCard key={context.draft.record?.id ?? "unknown"} context={context} {...props} />;
}
function DraftCard({
  allowDiscard = false,
  showResume = true,
  context,
}: { context: ReturnType<typeof useCommentDraft> } & Props) {
  const p = usePalette(),
    { controller, draft } = context;
  const [confirm, setConfirm] = useState(false);
  if (!draft.record && !draft.error) return null;
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text style={[s.subheading, { color: p.ink }]}>
        {draft.rejection
          ? "Revisa tu comentario"
          : draft.record?.phase === "pending"
            ? "Comentario sin confirmar"
            : "Comentario pendiente"}
      </Text>
      {draft.error ? (
        <Notice
          message={draft.error}
          retry={
            draft.blocked || draft.dirty
              ? () => {
                  if (draft.blocked) void controller.restore();
                  else void controller.retryStorage().catch(() => {});
                }
              : undefined
          }
        />
      ) : null}
      {draft.record ? (
        <>
          <Text style={[s.body, { color: p.muted }]}>
            {draft.dirty
              ? "Tu texto está en memoria; aún no pudimos guardarlo en este dispositivo."
              : draft.rejection
                ? "Tu texto se conserva para que puedas revisarlo o descartarlo."
                : draft.record.phase === "pending"
                  ? "Conservamos el mensaje y su identificador para confirmar el mismo envío."
                  : "Tienes un mensaje guardado en este dispositivo sin publicar."}
          </Text>
          {showResume ? (
            <Action
              label="Retomar comentario"
              disabled={draft.busy}
              onPress={() => router.navigate(`/result/${draft.record!.workoutId}`)}
            />
          ) : null}
          {allowDiscard ? (
            confirm ? (
              <>
                <Notice message="Se descartará el borrador de este dispositivo. Si el mensaje ya se publicó, seguirá en la conversación hasta que lo borres allí." />
                <Action
                  label="Confirmar descarte de comentario"
                  secondary
                  busy={draft.busy}
                  onPress={() => {
                    void controller
                      .discard()
                      .then(() => setConfirm(false))
                      .catch(() => {});
                  }}
                />
                <Action
                  label="Cancelar descarte de comentario"
                  quiet
                  disabled={draft.busy}
                  onPress={() => setConfirm(false)}
                />
              </>
            ) : (
              <Action
                label="Descartar comentario pendiente"
                secondary
                disabled={draft.busy || draft.blocked}
                onPress={() => setConfirm(true)}
              />
            )
          ) : null}
        </>
      ) : null}
    </View>
  );
}
