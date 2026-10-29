import { typedWorkoutSchema, type TypedWorkout } from "../lib/mobile/typed-recording-contracts";
import { typedCatalogSchema, type TypedCatalogEntry } from "../lib/mobile/typed-exercise-contracts";
import {
  editableTypedPersonalItems,
  typedPersonalItemsInput,
  type TypedPersonalEditorItem,
} from "./typed-personal-routines";
export function prepareTypedWorkoutRoutine(
  input: TypedWorkout["workout"],
  available: TypedCatalogEntry[],
):
  | { ok: false; reason: string; message: string }
  | { ok: true; kind: "recorded"; title: string; items: TypedPersonalEditorItem[] } {
  try {
    const source = typedWorkoutSchema.parse({ version: 3, workout: input }).workout,
      catalog = typedCatalogSchema.parse({ version: 2, exercises: available }).exercises,
      byId = new Map(catalog.map((e) => [e.id, e]));
    const items = [];
    for (const [position, row] of source.structure.exercises.entries()) {
      const metadata = byId.get(row.exerciseId);
      if (!metadata || metadata.recordType !== row.prescribed.recordType)
        return {
          ok: false,
          reason: "unavailable",
          message:
            "Un ejercicio o su tipo ya no está disponible. Conservamos el resultado completo; no preparamos una rutina parcial.",
        };
      items.push({
        ...metadata,
        id: row.id,
        exerciseId: metadata.id,
        position,
        prescribed: row.prescribed,
        note: row.note ?? "",
        restSeconds: row.restSeconds,
        supersetId: row.supersetId,
        supersetRestSeconds: row.supersetRestSeconds,
      });
    }
    const title =
      source.title ?? source.programName ?? `Entrenamiento ${source.sessionLabel ?? "libre"}`;
    const editable = editableTypedPersonalItems({
      id: source.id,
      name: title,
      folderId: null,
      revision: 0,
      position: 0,
      createdAt: source.startedAt,
      updatedAt: source.startedAt,
      items,
    });
    typedPersonalItemsInput(editable);
    return { ok: true, kind: "recorded", title, items: editable };
  } catch {
    return {
      ok: false,
      reason: "invalid",
      message: "No pudimos preparar los objetivos completos. El resultado se conserva sin cambios.",
    };
  }
}
