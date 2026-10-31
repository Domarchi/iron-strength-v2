import { FreeStart } from "./free-start";
import { TrainingDownloadCard } from "./training-download-card";
import { router } from "expo-router";
import { Action, Page } from "./ui";
import { HomeHeading } from "./home-heading";
import { useSession } from "../lib/session";
import { TrainingCard } from "./training-card";
import { CommentDraftCard } from "./comment-draft-card";
import { DownloadedSessions } from "./downloaded-sessions";
export function OfflineWeek() {
  const { state } = useSession();
  if (state.status !== "authenticated") return null;
  return (
    <Page>
      <HomeHeading
        fullName={state.session.profile.fullName}
        onAccount={() => router.navigate("/account")}
      />
      <TrainingCard />
      <CommentDraftCard />
      <FreeStart />
      <DownloadedSessions />
      <Action label="Mis rutinas" onPress={() => router.push("/library")} />
      <Action
        label="Biblioteca de ejercicios"
        secondary
        onPress={() => router.push("/exercises")}
      />
      <TrainingDownloadCard compact />
      <Action
        label="Explorar rutinas de ejemplo"
        secondary
        onPress={() => router.navigate("/train")}
      />
    </Page>
  );
}
