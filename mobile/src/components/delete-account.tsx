import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { isDeleteConfirmation } from "../../../src/domain/account";
import { Action, Notice, s, usePalette } from "./ui";
import { useSession } from "../lib/session";
import { useTraining } from "../lib/training-context";
import { useAccountRemoval } from "../lib/account-removal-context";
import { useCommentDraft } from "../lib/comment-context";
export function DeleteAccount() {
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, training } = useTraining(),
    { controller: removalController } = useAccountRemoval(),
    { controller: comments, draft } = useCommentDraft();
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  if (state.status !== "authenticated") return null;
  if (state.session.profile.role === "coach")
    return (
      <Text style={[s.caption, { color: p.muted }]}>
        La cuenta propietaria del coach administra los programas y alumnos; no se elimina desde la
        app.
      </Text>
    );
  const userId = state.session.profile.id;
  async function submit() {
    if (!isDeleteConfirmation(confirmation) || busy || training.busy || draft.busy) return;
    setBusy(true);
    setError(null);
    try {
      // Flush valid drafts before unmounting the training provider. Unknown formats stay until explicit deletion.
      if (!training.blocked) await controller.flush();
      if (!draft.blocked) await comments.flush();
      await removalController.request(userId, () => client.deleteAccount(confirmation));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar la eliminación.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[s.divider, { borderColor: p.border }]}>
      <Text style={[s.subheading, { color: p.ink }]}>Borrar mi cuenta</Text>
      <Text style={[s.body, { color: p.muted }]}>
        Se borran para siempre tu cuenta, planes asignados, entrenamientos, medidas, fotos, logros y
        comentarios de tus entrenamientos. También se descartan los registros, mensajes pendientes y
        demos de esta cuenta en este dispositivo. No se puede deshacer. Antes puedes exportar tu
        historial desde Cuenta en la web.
      </Text>
      {error ? <Notice message={error} /> : null}
      {open ? (
        <>
          <Text style={[s.label, { color: p.ink }]}>Para confirmar, escribe BORRAR</Text>
          <TextInput
            accessibilityLabel="Confirmación de borrado de cuenta"
            value={confirmation}
            onChangeText={setConfirmation}
            maxLength={30}
            editable={!busy}
            autoComplete="off"
            autoCapitalize="characters"
            style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }]}
          />
          <Action
            label="Borrar mi cuenta para siempre"
            disabled={
              !isDeleteConfirmation(confirmation) ||
              !training.ready ||
              training.busy ||
              !draft.ready ||
              draft.busy
            }
            busy={busy}
            onPress={() => {
              void submit();
            }}
          />
          <Action
            label="Cancelar borrado"
            secondary
            disabled={busy}
            onPress={() => {
              setOpen(false);
              setConfirmation("");
              setError(null);
            }}
          />
        </>
      ) : (
        <Action
          label="Quiero borrar mi cuenta"
          secondary
          disabled={training.busy || draft.busy || !draft.ready}
          onPress={() => setOpen(true)}
        />
      )}
    </View>
  );
}
