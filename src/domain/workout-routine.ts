import { mobileWorkoutSchema, type MobileWorkout } from "../lib/mobile/contracts";
import { mobileCatalogSchema, type MobileCatalogEntry } from "../lib/mobile/exercise-contracts";
import {
  editablePersonalItems,
  personalItemsInput,
  type PersonalEditorItem,
} from "./personal-routines";
import { prepareWorkoutRepeat } from "./workout-repeat";
import type { WorkoutStructure } from "../lib/mobile/recording-contracts";

type Failure = { ok: false; reason: string; message: string };
export type RoutinePreparation =
  | Failure
  | {
      ok: true;
      kind: "recorded" | "derived";
      title: string;
      items: PersonalEditorItem[];
    };

/** A result is the only source of prescriptions; a current base is never an input. */
export function prepareWorkoutRoutine(
  input: MobileWorkout["workout"],
  available: MobileCatalogEntry[],
): RoutinePreparation {
  try {
    const source = mobileWorkoutSchema.parse({ version: 1, workout: input }).workout;
    const catalog = mobileCatalogSchema.parse({ version: 1, exercises: available }).exercises;
    const byId = new Map(catalog.map((e) => [e.id.toLowerCase(), e]));
    let rows: Omit<WorkoutStructure["exercises"][number], "prescribedExerciseId">[];
    if (source.structure) {
      rows = source.structure.exercises;
      if (
        new Set(rows.map((r) => r.id)).size !== rows.length ||
        new Set(source.exercises.map((e) => e.position)).size !== source.exercises.length ||
        source.exercises.some(
          (e) => rows[e.position]?.exerciseId.toLowerCase() !== e.exerciseId.toLowerCase(),
        )
      )
        throw Error("Identidades incoherentes");
    } else {
      const repeated = prepareWorkoutRepeat(source, catalog);
      if (!repeated.ok) return repeated;
      if (repeated.plan.warnings.includes("warmups_only"))
        return {
          ok: false,
          reason: "warmups_only",
          message:
            "Hay ejercicios con solo calentamientos y sin objetivos guardados. Crea sus objetivos en Mis rutinas; no convertimos calentamientos en series de trabajo.",
        };
      rows = repeated.plan.exercises.map((e) => ({
        ...e,
        id: e.sets[0].id,
      }));
    }
    const items = [];
    for (const [position, row] of rows.entries()) {
      const metadata = byId.get(row.exerciseId.toLowerCase());
      if (!metadata)
        return {
          ok: false,
          reason: "unavailable",
          message:
            "Un ejercicio ya no está disponible en tu catálogo. Conservamos el resultado completo; no preparamos una rutina parcial.",
        };
      items.push({
        ...metadata,
        ...row.prescribed,
        id: row.id,
        exerciseId: metadata.id,
        position,
        note: row.note ?? "",
        restSeconds: row.restSeconds,
        supersetId: row.supersetId,
        supersetRestSeconds: row.supersetRestSeconds,
      });
    }
    const editable = editablePersonalItems({
      id: source.id,
      name: "Propuesta",
      folderId: null,
      revision: 0,
      position: 0,
      createdAt: source.startedAt,
      updatedAt: source.startedAt,
      items,
    });
    personalItemsInput(editable);
    return {
      ok: true,
      kind: source.structure ? "recorded" : "derived",
      title:
        source.title ?? source.programName ?? `Entrenamiento ${source.sessionLabel ?? "libre"}`,
      items: editable,
    };
  } catch {
    return {
      ok: false,
      reason: "invalid",
      message: "No pudimos preparar los objetivos completos. El resultado se conserva sin cambios.",
    };
  }
}
