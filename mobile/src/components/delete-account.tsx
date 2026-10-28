import { useTrainingPreferences } from "../lib/training-preferences-context";
import { usePersonalExerciseDraft } from "../lib/personal-exercise-context";
import { useLibraryDrafts } from "../lib/library-context";
import { useWeekDownload } from "../lib/week-context";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { isDeleteConfirmation } from "../../../src/domain/account";
import { Action, Notice, s, usePalette } from "./ui";
import { useSession } from "../lib/session";
import { useTraining } from "../lib/training-context";
import { useAccountRemoval } from "../lib/account-removal-context";
import { useCommentDraft } from "../lib/comment-context";
import { useWorkoutSyncQueue } from "../lib/sync-context";
export function DeleteAccount() {
  const { controller: preferencesController, preferences } = useTrainingPreferences();
  const { controller: exerciseController, exercises } = usePersonalExerciseDraft();
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, training } = useTraining(),
    { controller: removalController } = useAccountRemoval(),
    { controller: comments, draft } = useCommentDraft(),
    { controller: routines, library } = useLibraryDrafts(),
    { controller: downloads, download } = useWeekDownload(),
    sync = useWorkoutSyncQueue();
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
  const userId = state.session.profile.id,
    offline = state.mode === "offline";
  async function submit() {
    if (
      !isDeleteConfirmation(confirmation) ||
      busy ||
      training.busy ||
      training.closing ||
      sync.queue.busy ||
      sync.syncing ||
      sync.transferring ||
      sync.paused ||
      preferences.busy ||
      preferences.paused ||
      !preferences.ready ||
      !exercises.ready ||
      exercises.busy ||
      exercises.paused ||
      library.busy ||
      !library.ready ||
      draft.busy ||
      downloads.getSnapshot().busy ||
      offline
    )
      return;
    setBusy(true);
    setError(null);
    let resume: (() => void) | undefined;
    let resumePreferences: (() => void) | undefined;
    let resumeExercises: (() => void) | undefined;
    try {
      resumeExercises = exerciseController.pauseWrites();
      resumePreferences = preferencesController.pauseWrites();
      resume = sync.pause();
      // Flush valid drafts before unmounting the training provider. Unknown formats stay until explicit deletion.
      await downloads.flush();
      if (!sync.queue.blocked) await sync.flush();
      if (!training.blocked) await controller.flush();
      if (!draft.blocked) await comments.flush();
      if (!library.blocked) await routines.flush();
      if (!exercises.blocked) await exerciseController.flush();
      await removalController.request(userId, () => client.deleteAccount(confirmation, userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar la eliminación.");
    } finally {
      resume?.();
      resumePreferences?.();
      resumeExercises?.();
      setBusy(false);
    }
  }
  return (
    <View style={[s.divider, { borderColor: p.border }]}>
      <Text style={[s.subheading, { color: p.ink }]}>Borrar mi cuenta</Text>
      <Text style={[s.body, { color: p.muted }]}>
        Se borran para siempre tu cuenta, ejercicios propios, rutinas personales, planes asignados,
        entrenamientos, medidas, fotos, logros y comentarios de tus entrenamientos. También se
        descartan los registros, mensajes pendientes y demos y descargas de esta cuenta en este
        dispositivo. No se puede deshacer. Antes puedes exportar tu historial desde Cuenta en la
        web.
      </Text>
      {preferences.busy ? (
        <Text style={[s.caption, { color: p.muted }]}>
          Espera a que se guarden tus preferencias antes de borrar la cuenta.
        </Text>
      ) : null}
      {offline ? (
        <Text style={[s.body, { color: p.muted }]}>
          Conecta para borrar tu cuenta. Tus datos locales se conservan.
        </Text>
      ) : null}
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
              preferences.busy ||
              preferences.paused ||
              !preferences.ready ||
              !exercises.ready ||
              exercises.busy ||
              exercises.paused ||
              library.busy ||
              !library.ready ||
              training.busy ||
              training.closing ||
              !sync.queue.ready ||
              sync.queue.busy ||
              sync.syncing ||
              sync.transferring ||
              sync.paused ||
              !draft.ready ||
              draft.busy ||
              !download.ready ||
              download.busy ||
              offline
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
          disabled={
            preferences.busy ||
            preferences.paused ||
            !preferences.ready ||
            !exercises.ready ||
            exercises.busy ||
            exercises.paused ||
            library.busy ||
            !library.ready ||
            training.busy ||
            training.closing ||
            !sync.queue.ready ||
            sync.queue.busy ||
            sync.syncing ||
            sync.transferring ||
            sync.paused ||
            draft.busy ||
            !draft.ready ||
            !download.ready ||
            download.busy ||
            offline
          }
          onPress={() => setOpen(true)}
        />
      )}
    </View>
  );
}
