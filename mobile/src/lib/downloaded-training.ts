import type { Bundle } from "../../../src/lib/offline/training-bundle";
import {
  typedPersonalRoutineSchema,
  type TypedPersonalRoutine,
} from "../../../src/lib/mobile/typed-personal-contracts";
import type { DownloadController } from "../../../src/lib/offline/download-controller";
export function downloadedPersonalRoutine(bundle: Bundle | null, userId: string, id: string) {
  return bundle?.userId === userId
    ? (bundle.library.routines.find((r) => r.id === id) ?? null)
    : null;
}
export class PersonalPreviewChanged extends Error {
  constructor() {
    super("La rutina cambió. Vuelve a revisar la vista previa antes de empezar.");
  }
}
export function requireSamePersonalPreview(
  preview: TypedPersonalRoutine,
  current: TypedPersonalRoutine | null,
) {
  if (
    !current ||
    JSON.stringify(typedPersonalRoutineSchema.parse(preview)) !==
      JSON.stringify(typedPersonalRoutineSchema.parse(current))
  )
    throw new PersonalPreviewChanged();
  return current;
}
export async function verifiedDownloadedTraining(controller: DownloadController) {
  if (!(await controller.restore()))
    throw Error(
      controller.getSnapshot().error?.message ?? "Comprueba la descarga antes de empezar.",
    );
  const { bundle, verified } = controller.getSnapshot();
  if (!verified || !bundle)
    throw Error("Descarga tus entrenamientos con conexión antes de empezar.");
  return bundle;
}
