import {
  assignedContextSchema,
  type AssignedTrainingContext,
} from "../../../src/lib/workout/training-context";
import { mobileRoutineSchema, type MobileRoutine } from "../../../src/lib/mobile/contracts";
import { typedPrescriptionFromLegacy } from "../../src/lib/typed-training";
import {
  typedWorkoutSchema,
  type TypedRecordingPayload,
} from "../../../src/lib/mobile/typed-recording-contracts";
import { trainingTotals } from "../../../src/domain/training-metrics";
import { santiagoDate } from "../../../src/domain/dates";
import { fixtureTrainingSetId } from "./training-progress-results";
export function assignedFromLegacy(
  value: unknown,
  userId: string,
  program: { startDate: string; endsOn: string },
  revision = 1,
  history: Record<
    string,
    import("../../../src/lib/data/exercise-history").ExerciseHistoryPage
  > = {},
) {
  const c = mobileRoutineSchema.parse(value);
  const choice = (
    e: Pick<
      MobileRoutine["exercises"][number],
      "exerciseId" | "name" | "isBodyweight" | "prescribed" | "lastWeightKg"
    >,
  ) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    isBodyweight: e.isBodyweight,
    prescribed: typedPrescriptionFromLegacy(e.prescribed),
    lastMetrics: null,
    legacyLastWeightKg: e.lastWeightKg ?? null,
  });
  return assignedContextSchema.parse({
    version: 5,
    previousSets: Object.entries(history).flatMap(([exerciseId, h]) =>
      h.items.length
        ? [
            {
              exerciseId,
              recordType: null,
              sets: h.items[0].sets.map((s) => ({
                recordType: null,
                weightKg: s.weightKg,
                reps: s.reps,
                durationSeconds: null,
                distanceMeters: null,
                setType: s.isWarmup ? "warmup" : "working",
                effort: null,
              })),
            },
          ]
        : [],
    ),
    userId,
    origin: { kind: "assigned", programId: c.session.programId, programSessionId: c.session.id },
    title: c.session.title ?? null,
    sessionLabel: c.session.label,
    session: {
      ...c.session,
      title: c.session.title ?? null,
      startDate: program.startDate,
      endsOn: program.endsOn,
      revision,
    },
    exercises: c.exercises.map((e) => ({
      ...choice(e),
      sessionExerciseId: e.sessionExerciseId,
      note: e.note,
      restSeconds: e.restSeconds ?? null,
      supersetId: e.supersetId ?? null,
      supersetRestSeconds: e.supersetRestSeconds ?? null,
      alternatives: (e.alternatives ?? []).map(choice),
    })),
  });
}
export function assignedFixtureResult(c: AssignedTrainingContext, p: TypedRecordingPayload) {
  if (p.source !== "assigned") throw Error("expected assigned");
  const totals = trainingTotals(
    p.workout.sets.map((s) => ({ ...s.metrics, setType: s.setType, effort: s.effort })),
  );
  return typedWorkoutSchema.parse({
    version: 3,
    workout: {
      id: p.id,
      sourceKind: "assigned",
      title: null,
      personalRoutineId: null,
      personalRoutineRevision: null,
      programName: c.session.programName,
      sessionLabel: c.sessionLabel,
      startedAt: p.workout.startedAt,
      performedOn: santiagoDate(new Date(p.workout.startedAt)),
      durationSeconds: p.workout.durationSeconds,
      perceivedEffort: p.workout.perceivedEffort ?? null,
      note: p.workout.note ?? null,
      structure: p.structure,
      exercises: p.structure.exercises.map((r, position) => {
        const source = c.exercises[position],
          selected =
            source.exerciseId === r.exerciseId
              ? source
              : source.alternatives.find((a) => a.exerciseId === r.exerciseId);
        if (!selected) throw Error("unauthorized fixture alternative");
        return {
          ...r,
          position,
          name: selected.name,
          prescribedExerciseName: source.name,
          athleteNote: p.workout.exerciseNotes[position].note,
          sets: p.workout.sets
            .filter((s) => s.position === position)
            .map((s) => ({
              id: fixtureTrainingSetId(p.id, position * 20 + s.setNumber),
              setNumber: s.setNumber,
              metrics: s.metrics,
              setType: s.setType,
              effort: s.effort,
            })),
        };
      }),
      summary: {
        workingSets: totals.workingSets,
        volumeKg: totals.externalVolumeKg,
        bodyweightReps: totals.bodyweightReps,
        exerciseCount: new Set(p.workout.sets.map((s) => s.position)).size,
        recordedSeconds: totals.durationSeconds,
        distanceMeters: totals.distanceMeters,
      },
    },
  });
}
