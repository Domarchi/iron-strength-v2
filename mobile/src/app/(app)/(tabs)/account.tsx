import { useState } from "react";
import { router } from "expo-router";
import { Linking, Text, View } from "react-native";
import { Action, Brand, Notice, Page, ScreenIntro, s, usePalette } from "../../../components/ui";
import { AppearanceSelect } from "../../../components/appearance-select";
import { useSession } from "../../../lib/session";
import { useTraining } from "../../../lib/training-context";
import { TrainingCard } from "../../../components/training-card";
import { DeleteAccount } from "../../../components/delete-account";
import { CommentDraftCard } from "../../../components/comment-draft-card";
import { useCommentDraft } from "../../../lib/comment-context";
export default function Account() {
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, training } = useTraining(),
    { controller: comments, draft } = useCommentDraft();
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
    try {
      await comments.clearForLogout();
      await controller.clearForLogout();
      await client.logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos salir. Reintenta.");
    }
  }
  return (
    <Page>
      <Brand />
      <ScreenIntro eyebrow="CUENTA" title="Tu cuenta" />
      <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
        <Text style={[s.subheading, { color: p.ink }]}>{person.fullName}</Text>
        <Text style={[s.body, { color: p.muted }]}>{person.email}</Text>
        <Text style={[s.caption, { color: p.blue }]}>
          {person.role === "coach" ? "COACH · TAMBIÉN PUEDES ENTRENAR" : "ALUMNO"}
        </Text>
      </View>
      <AppearanceSelect />
      <Action label="Privacidad y ayuda" quiet onPress={() => router.navigate("/privacy")} />
      <TrainingCard />
      <CommentDraftCard allowDiscard />
      {error ? <Notice message={error} /> : null}
      {training.error ? <Notice message={training.error} /> : null}
      {person.role === "coach" ? (
        <>
          <Text style={[s.subheading, { color: p.ink }]}>Tu espacio de coach</Text>
          <Action
            label="Planificar rutinas en la web"
            onPress={() => {
              void open("/coach/programs");
            }}
          />
          <Action
            label="Ver mis alumnos en la web"
            secondary
            onPress={() => {
              void open("/coach/students");
            }}
          />
          <Text style={[s.body, { color: p.muted }]}>
            El navegador usa su propia sesión. Si te pide acceso, entra con tu cuenta de Iron
            Strength.
          </Text>
        </>
      ) : null}
      <Action
        label="Gestionar cuenta en la web"
        secondary
        onPress={() => {
          void open("/account");
        }}
      />
      <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
        <Text style={[s.subheading, { color: p.ink }]}>En tu teléfono</Text>
        <Text style={[s.body, { color: p.muted }]}>
          Tus sesiones iniciadas se recuperan en este dispositivo. Las demos se guardan aparte y no
          se envían al coach.
        </Text>
      </View>
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
      <Action
        label="Salir"
        secondary
        disabled={
          !training.ready ||
          training.blocked ||
          !!training.active ||
          training.busy ||
          !draft.ready ||
          draft.blocked ||
          !!draft.record ||
          draft.dirty ||
          draft.busy
        }
        onPress={() => {
          void logout();
        }}
      />
      <Action label="Ver rutinas de ejemplo" secondary onPress={() => router.navigate("/train")} />
      <DeleteAccount />
    </Page>
  );
}
