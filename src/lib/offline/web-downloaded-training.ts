import type { Bundle } from "./training-bundle";
import { assignedCanStart, previousTypedContextSchema } from "../workout/training-context";
import type { TypedPersonalRoutine } from "../mobile/typed-personal-contracts";
import { requireSamePersonalPreview } from "../../../mobile/src/lib/downloaded-training";
function own(bundle: Bundle, userId: string) {
  if (bundle.userId !== userId) throw Error("La descarga pertenece a otra cuenta.");
}
export function downloadedAssignedContext(
  bundle: Bundle,
  userId: string,
  sessionId: string,
  today: string,
) {
  own(bundle, userId);
  const context = bundle.week?.sessions.find((s) => s.context.session.id === sessionId)?.context;
  if (!context || !assignedCanStart(context, userId, today))
    throw Error(
      "Esta sesión no corresponde a la semana vigente. Actualiza tu descarga con conexión.",
    );
  return context;
}
export function downloadedPersonalContext(
  bundle: Bundle,
  userId: string,
  preview: TypedPersonalRoutine,
) {
  own(bundle, userId);
  const routine = requireSamePersonalPreview(
    preview,
    bundle.library.routines.find((r) => r.id === preview.id) ?? null,
  );
  if (!routine.items.length) throw Error("Agrega ejercicios a la rutina antes de empezar.");
  return previousTypedContextSchema.parse({
    version: 3,
    origin: { kind: "personal", routineId: routine.id, revision: routine.revision },
    title: routine.name,
    sessionLabel: "Personal",
    exercises: routine.items.map((item) => ({
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      name: item.name,
      isBodyweight: item.isBodyweight,
      prescribed: item.prescribed,
      lastMetrics: null,
      note: item.note,
      restSeconds: item.restSeconds,
      supersetId: item.supersetId,
      supersetRestSeconds: item.supersetRestSeconds,
      alternatives: [],
    })),
  });
}
export function downloadedFreeContext(bundle: Bundle, userId: string) {
  own(bundle, userId);
  if (!bundle.catalog.exercises.length)
    throw Error("Descarga ejercicios con conexión antes de empezar un entrenamiento libre.");
  return previousTypedContextSchema.parse({
    version: 3,
    origin: { kind: "free" },
    title: "Entrenamiento libre",
    sessionLabel: "Libre",
    exercises: [],
  });
}
