import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { randomUUID } from "expo-crypto";
import { CommentDraftController } from "./comment-draft";
import { trainingStorage } from "./training-storage";
import { useSession } from "./session";
const Context = createContext<CommentDraftController | null>(null);
export function CommentProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession();
  const [controller] = useState(
    () =>
      new CommentDraftController(
        userId,
        trainingStorage,
        async (input) => {
          await client.publishComment(input.workoutId, input.id, input.body);
        },
        randomUUID,
      ),
  );
  useEffect(() => {
    void controller.restore();
    return () => controller.dispose();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useCommentDraft() {
  const controller = useContext(Context);
  if (!controller) throw Error("Falta la conversación local.");
  const draft = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, draft };
}
