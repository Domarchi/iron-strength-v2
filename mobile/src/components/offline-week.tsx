import { router } from "expo-router";
import { Action, Brand, Page, ScreenIntro } from "./ui";
import { useSession } from "../lib/session";
import { TrainingCard } from "./training-card";
import { CommentDraftCard } from "./comment-draft-card";
import { DownloadedSessions } from "./downloaded-sessions";
export function OfflineWeek() {
  const { state } = useSession();
  if (state.status !== "authenticated") return null;
  return (
    <Page>
      <Brand />
      <ScreenIntro
        eyebrow="SEMANA DESCARGADA"
        title={`Hola, ${state.session.profile.fullName.trim().split(" ")[0]}`}
        description="Consulta tus rutinas y sigue con el registro de este dispositivo."
      />
      <TrainingCard />
      <CommentDraftCard />
      <DownloadedSessions />
      <Action
        label="Explorar rutinas de ejemplo"
        secondary
        onPress={() => router.navigate("/train")}
      />
    </Page>
  );
}
