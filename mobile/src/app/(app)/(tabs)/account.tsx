import { useTrainingDownload } from "../../../lib/training-download-context";
import { useWorkoutRemoval } from "../../../lib/workout-removal-context";
import { WorkoutRemovalCard } from "../../../components/workout-removal-card";
import { useCorrectionDraft } from "../../../lib/correction-context";
import { CorrectionDraftCard } from "../../../components/correction-draft-card";
import { TrainingPreferencesEditor } from "../../../components/training-preferences-editor";
import { PersonalExerciseDraftCard } from "../../../components/personal-exercise-draft-card";
import { usePersonalExerciseDraft } from "../../../lib/personal-exercise-context";
import { useLibraryDrafts } from "../../../lib/library-context";
import { LibraryDraftCard } from "../../../components/library-draft-card";
import { TrainingDownloadCard } from "../../../components/training-download-card";
import { useWeekDownload } from "../../../lib/week-context";
import { useState } from "react";
import { router } from "expo-router";
import { Linking, Text, View } from "react-native";
import { Action, Notice, Page, ScreenIntro, s, usePalette } from "../../../components/ui";
import { AlertsSettings } from "../../../components/alerts-settings";
import { Avatar } from "../../../ui/display";
import { NavRow } from "../../../components/nav-row";
import { AppearanceSelect } from "../../../components/appearance-select";
import { useSession } from "../../../lib/session";
import { useTraining } from "../../../lib/training-context";
import { TrainingCard } from "../../../components/training-card";
import { DeleteAccount } from "../../../components/delete-account";
import { CommentDraftCard } from "../../../components/comment-draft-card";
import { useCommentDraft } from "../../../lib/comment-context";
import { useWorkoutSyncQueue } from "../../../lib/sync-context";
export default function Account() {
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, training } = useTraining(),
    { controller: comments, draft } = useCommentDraft(),
    { controller: routines, library } = useLibraryDrafts(),
    { controller: ownExercises, exercises } = usePersonalExerciseDraft(),
    { controller: corrections, correction } = useCorrectionDraft(),
    { controller: removals, removal } = useWorkoutRemoval(),
    { controller: downloads, download } = useWeekDownload(),
    { controller: fullDownloads, download: fullDownload } = useTrainingDownload(),
    sync = useWorkoutSyncQueue();
  const [error, setError] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false);
  if (state.status !== "authenticated") return null;
  const person = state.session.profile;
  async function open(path: string) {
    try {
      await Linking.openURL(client.origin + path);
    } catch {
      setError("No pudimos abrir el navegador. Reintenta.");
    }
  }
  async function logout() {
    let releaseDownload: (() => void) | undefined;
    let resume: (() => void) | undefined;
    let releaseRemoval: (() => void) | undefined;
    let releaseCorrection: (() => void) | undefined;
    let releaseExercises: (() => void) | undefined;
    try {
      releaseDownload = await fullDownloads.reserve();
      releaseRemoval = removals.pauseWrites();
      releaseCorrection = corrections.pauseWrites();
      releaseExercises = ownExercises.pauseWrites();
      resume = sync.pause();
      await downloads.flush();
      await sync.clearForLogout();
      await comments.clearForLogout();
      await routines.clearForLogout();
      await ownExercises.clearForLogout();
      await corrections.clearForLogout();
      await removals.clearForLogout();
      await controller.clearForLogout();
      await client.logout(person.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos salir. Reintenta.");
    } finally {
      resume?.();
      releaseExercises?.();
      releaseCorrection?.();
      releaseRemoval?.();
      releaseDownload?.();
    }
  }
  return (
    <Page>
      <ScreenIntro title="Cuenta" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar name={person.fullName} size={56} tone="accent" />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.subheading, { color: p.ink }]}>{person.fullName}</Text>
          <Text style={[s.body, { color: p.muted }]}>{person.email}</Text>
          <Text style={[s.caption, { color: p.blue }]}>
            {person.role === "coach" ? "COACH" : "ALUMNO"}
          </Text>
        </View>
      </View>
      <TrainingCard />
      <CommentDraftCard allowDiscard />
      <LibraryDraftCard />
      <PersonalExerciseDraftCard />
      <CorrectionDraftCard />
      <WorkoutRemovalCard />
      <View style={[s.divider, { borderColor: p.border }]}>
        <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
          Preferencias
        </Text>
        <AppearanceSelect plain />
        <AlertsSettings />
        <TrainingPreferencesEditor plain />
      </View>
      <View style={[s.divider, { borderColor: p.border }]}>
        <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
          Datos y ayuda
        </Text>
        <NavRow
          label="Medidas corporales"
          hint="Peso y perímetros"
          onPress={() => router.navigate("/measurements")}
        />
        <NavRow label="Mis ejercicios" onPress={() => router.navigate("/my-exercises")} />
        <TrainingDownloadCard />
        <NavRow label="Privacidad y ayuda" onPress={() => router.navigate("/privacy")} />
      </View>
      {error ? <Notice message={error} /> : null}
      {person.role === "coach" ? (
        <>
          <Text style={[s.subheading, { color: p.ink }]}>Tu espacio de coach</Text>
          <NavRow
            label="Mis alumnos"
            hint="Quién necesita atención"
            onPress={() => router.navigate("/students")}
          />
          <NavRow
            label="Planificar rutinas en la web"
            onPress={() => {
              void open("/coach/programs");
            }}
          />
          <NavRow
            label="Ver mis alumnos en la web"
            onPress={() => {
              void open("/coach/students");
            }}
          />
          <Text style={[s.caption, { color: p.muted }]}>Se abre en tu navegador.</Text>
        </>
      ) : null}
      <NavRow
        label="Gestionar cuenta en la web"
        onPress={() => {
          void open("/account");
        }}
      />
      {training.active ? (
        <>
          <Text style={[s.body, { color: p.muted }]}>
            Antes de salir, retoma o descarta el entrenamiento pendiente.
          </Text>
          {confirm ? (
            <>
              <Notice message="Se eliminará el registro pendiente de este dispositivo. Si ya se envió al servidor, seguirá en tu historial." />
              <Action
                label="Confirmar descarte"
                secondary
                onPress={() => {
                  void controller
                    .discard()
                    .then(() => setConfirm(false))
                    .catch((e) => setError(e.message));
                }}
              />
              <Action label="Cancelar descarte" secondary onPress={() => setConfirm(false)} />
            </>
          ) : (
            <Action
              label="Descartar entrenamiento pendiente"
              secondary
              onPress={() => setConfirm(true)}
            />
          )}
        </>
      ) : null}
      {download.busy || fullDownload.busy ? (
        <Text style={[s.body, { color: p.muted }]}>
          Espera a que termine la descarga antes de salir.
        </Text>
      ) : null}
      {state.mode === "offline" ? (
        <Text style={[s.caption, { color: p.muted }]}>
          Salir retira el acceso local. Para volver a entrar necesitarás conexión.
        </Text>
      ) : null}
      {sync.queue.verified && sync.queue.entries.some((e) => e.phase === "pending") ? (
        <Text style={[s.body, { color: p.muted }]}>
          Antes de salir, sincroniza o descarta explícitamente los registros pendientes de este
          dispositivo.
        </Text>
      ) : null}
      <Action
        label="Salir"
        secondary
        disabled={
          !fullDownload.ready ||
          fullDownload.busy ||
          fullDownload.reserved ||
          !removal.ready ||
          removal.busy ||
          removal.paused ||
          removal.blocked ||
          removal.dirty ||
          !!removal.pending ||
          !correction.ready ||
          correction.busy ||
          correction.paused ||
          correction.blocked ||
          correction.dirty ||
          !!correction.pending ||
          !!correction.draft?.changed ||
          !exercises.ready ||
          exercises.busy ||
          exercises.paused ||
          exercises.blocked ||
          exercises.dirty ||
          !!exercises.pending ||
          !!exercises.draft?.changed ||
          !library.ready ||
          library.blocked ||
          library.busy ||
          library.dirty ||
          !!library.pending ||
          library.drafts.some((d) => d.changed) ||
          !training.ready ||
          training.blocked ||
          !!training.active ||
          training.busy ||
          training.closing ||
          !draft.ready ||
          draft.blocked ||
          !!draft.record ||
          draft.dirty ||
          draft.busy ||
          !download.ready ||
          download.busy ||
          !sync.queue.ready ||
          sync.queue.busy ||
          sync.syncing ||
          sync.transferring ||
          sync.paused ||
          (sync.queue.verified && sync.queue.entries.some((e) => e.phase === "pending"))
        }
        onPress={() => {
          void logout();
        }}
      />
      <NavRow
        label="Ver rutinas de ejemplo"
        hint="Demos locales, no se envían al coach"
        onPress={() => router.navigate("/train")}
      />
      <DeleteAccount />
    </Page>
  );
}
