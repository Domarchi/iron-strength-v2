import {
  typedPersonalRoutineSchema,
  type TypedPersonalRoutine,
} from "../../../src/lib/mobile/typed-personal-contracts";
import { personalRoutineContext } from "./personal-training";
import { typedContextSchema } from "./typed-training";
export function personalRoutineTrainingContext(value: TypedPersonalRoutine) {
  const routine = typedPersonalRoutineSchema.parse(value);
  if (!routine.items.length) throw Error("Agrega ejercicios a la rutina antes de empezar.");
  if (routine.items.every((i) => i.recordType === null && i.note.length <= 500))
    return personalRoutineContext({
      ...routine,
      items: routine.items.map((i) => ({
        ...i,
        sets: i.prescribed.sets,
        repsMin: i.prescribed.target.repsMin!,
        repsMax: i.prescribed.target.repsMax!,
        targetWeightKg: i.prescribed.target.targetWeightKg,
        series:
          i.prescribed.series?.map((t) => ({
            repsMin: t.repsMin!,
            repsMax: t.repsMax!,
            targetWeightKg: t.targetWeightKg,
          })) ?? null,
      })),
    });
  return typedContextSchema.parse({
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
