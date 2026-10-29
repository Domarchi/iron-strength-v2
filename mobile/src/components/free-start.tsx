import { useTrainingDownload } from "../lib/training-download-context";
import { verifiedDownloadedTraining } from "../lib/downloaded-training";
import { useRef, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { useSession } from "../lib/session";
import { useTraining } from "../lib/training-context";
import { freeRoutineContext } from "../lib/personal-training";
import { Action, Notice, s, usePalette } from "./ui";
import { PersonalField } from "./personal-controls";
export function FreeStart() {
  const p = usePalette(),
    { state } = useSession(),
    { controller: downloads, bundle } = useTrainingDownload(),
    { controller, training } = useTraining();
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(""),
    [starting, setStarting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const startingRef = useRef(false),
    offline = state.status === "authenticated" && state.mode === "offline";
  async function start() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      if (offline && !(await verifiedDownloadedTraining(downloads)).catalog.exercises.length)
        throw Error("No hay ejercicios descargados para un entrenamiento libre.");
      await controller.startPersonal(freeRoutineContext(title));
      const active = controller.getSnapshot().active;
      if (active) {
        setOpen(false);
        router.push({ pathname: "/workout/[id]", params: { id: active.draft.workoutId } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos iniciar el entrenamiento.");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }
  const disabled =
    (offline && !bundle?.catalog.exercises.length) ||
    !training.ready ||
    training.blocked ||
    training.busy ||
    training.closing ||
    !!training.active ||
    starting;
  return (
    <View style={{ gap: 12 }}>
      <Action
        label="Entrenamiento libre"
        secondary
        icon="plus"
        disabled={disabled}
        onPress={() => {
          setOpen(!open);
          setError(null);
        }}
      />
      {open ? (
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
          <PersonalField
            label="Nombre del entrenamiento"
            title="Nombre · opcional"
            value={title}
            onChange={setTitle}
            disabled={starting}
          />
          {error && error !== training.error ? <Notice message={error} /> : null}
          <Action
            label="Empezar libre"
            disabled={disabled}
            busy={starting}
            onPress={() => {
              void start();
            }}
          />
          <Action
            label="Cancelar inicio libre"
            quiet
            disabled={starting}
            onPress={() => setOpen(false)}
          />
        </View>
      ) : null}
    </View>
  );
}
