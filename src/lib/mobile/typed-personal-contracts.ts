import { z } from "zod";
import { LIMITS } from "../../domain/limits";
import { trainingPrescriptionSchema } from "../../domain/training-metrics";
import { validRestSeconds, validSupersetLayout } from "../../domain/supersets";
import { typedCatalogEntrySchema } from "./typed-exercise-contracts";
import { personalMutationResultSchema, personalLibrarySchema } from "./personal-contracts";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().nonnegative();
const name = z.string().trim().min(1).max(LIMITS.nameMax);
const rest = z.number().int().nullable().refine(validRestSeconds);
const itemFields = {
  id: uuid,
  exerciseId: uuid,
  prescribed: trainingPrescriptionSchema,
  note: z.string().refine((value) => Array.from(value).length <= LIMITS.noteMax),
  restSeconds: rest,
  supersetId: uuid.nullable(),
  supersetRestSeconds: rest,
};
export const typedPersonalItemSchema = z.object(itemFields).strict();
const validItems = (rows: z.infer<typeof typedPersonalItemSchema>[]) =>
  new Set(rows.map((row) => row.id)).size === rows.length &&
  validSupersetLayout(rows.map((row) => ({ ...row, name: "" })));
const items = z.array(typedPersonalItemSchema).max(LIMITS.exercisesPerSession).refine(validItems);
const entries = z
  .array(z.object({ id: uuid, revision }).strict())
  .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length);
const common = { version: z.literal(2), requestId: uuid, targetId: uuid };
const edit = { ...common, expectedRevision: revision };
const create = { ...common, expectedRevision: z.literal(0) };
const reorder = { ...common, expectedRevision: z.null() };
export const typedPersonalMutationSchema = z.discriminatedUnion("operation", [
  z
    .object({ ...create, operation: z.literal("folder_create"), data: z.object({ name }).strict() })
    .strict(),
  z
    .object({ ...edit, operation: z.literal("folder_rename"), data: z.object({ name }).strict() })
    .strict(),
  z
    .object({ ...edit, operation: z.literal("folder_delete"), data: z.object({}).strict() })
    .strict(),
  z
    .object({
      ...reorder,
      operation: z.literal("folders_reorder"),
      data: z.object({ entries }).strict(),
    })
    .strict(),
  z
    .object({
      ...create,
      operation: z.literal("routine_create"),
      data: z.object({ name, folderId: uuid.nullable(), items }).strict(),
    })
    .strict(),
  z
    .object({
      ...edit,
      operation: z.literal("routine_save"),
      data: z.object({ name, items }).strict(),
    })
    .strict(),
  z
    .object({
      ...edit,
      operation: z.literal("routine_move"),
      data: z.object({ folderId: uuid.nullable() }).strict(),
    })
    .strict(),
  z
    .object({ ...edit, operation: z.literal("routine_delete"), data: z.object({}).strict() })
    .strict(),
  z
    .object({
      ...create,
      operation: z.literal("routine_copy"),
      data: z
        .object({ sourceId: uuid, sourceRevision: revision, name, folderId: uuid.nullable() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...reorder,
      operation: z.literal("routines_reorder"),
      data: z.object({ folderId: uuid.nullable(), entries }).strict(),
    })
    .strict(),
]);
export type TypedPersonalMutation = z.infer<typeof typedPersonalMutationSchema>;
const snapshotItem = typedCatalogEntrySchema
  .omit({ id: true })
  .extend({
    ...itemFields,
    position: z
      .number()
      .int()
      .min(0)
      .max(LIMITS.exercisesPerSession - 1),
  })
  .strict()
  .refine((row) => row.recordType === row.prescribed.recordType);
export const typedPersonalRoutineSchema = z
  .object({
    id: uuid,
    name,
    folderId: uuid.nullable(),
    position: z.number().int().nonnegative(),
    revision,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    items: z
      .array(snapshotItem)
      .max(LIMITS.exercisesPerSession)
      .refine((rows) => validItems(rows) && rows.every((item, index) => item.position === index)),
  })
  .strict();
export const typedPersonalLibrarySchema = z
  .object({
    version: z.literal(2),
    userId: uuid,
    folders: z.array(
      z.object({ id: uuid, name, position: z.number().int().nonnegative(), revision }).strict(),
    ),
    routines: z.array(typedPersonalRoutineSchema),
  })
  .strict()
  .refine(({ folders, routines }) => {
    const folderIds = new Set(folders.map((folder) => folder.id));
    return (
      folderIds.size === folders.length &&
      new Set(folders.map((folder) => folder.position)).size === folders.length &&
      new Set(routines.map((row) => row.id)).size === routines.length &&
      new Set(routines.flatMap((row) => row.items.map((item) => item.id))).size ===
        routines.reduce((n, row) => n + row.items.length, 0) &&
      routines.every((row) => row.folderId === null || folderIds.has(row.folderId)) &&
      new Set(routines.map((row) => `${row.folderId}:${row.position}`)).size === routines.length
    );
  }, "La biblioteca está incompleta. Vuelve a consultarla con conexión.");
export type TypedPersonalLibrary = z.infer<typeof typedPersonalLibrarySchema>;
export type TypedPersonalRoutine = TypedPersonalLibrary["routines"][number];
export type TypedPersonalItemInput = z.infer<typeof typedPersonalItemSchema>;
export const typedPersonalMutationResultSchema = personalMutationResultSchema
  .extend({ version: z.literal(2) })
  .strict();
export type TypedPersonalMutationResult = z.infer<typeof typedPersonalMutationResultSchema>;

/** Projects a declared legacy routine without inferring exercise types. */
export function upgradePersonalRoutine(
  routine: import("./personal-contracts").PersonalRoutine,
): TypedPersonalRoutine {
  return typedPersonalRoutineSchema.parse({
    ...routine,
    items: routine.items.map((item) => ({
      id: item.id,
      exerciseId: item.exerciseId,
      position: item.position,
      name: item.name,
      muscleGroup: item.muscleGroup,
      equipment: item.equipment,
      isBodyweight: item.isBodyweight,
      progressionIncrementKg: item.progressionIncrementKg,
      recordType: null,
      prescribed: {
        recordType: null,
        sets: item.sets,
        target: {
          repsMin: item.repsMin,
          repsMax: item.repsMax,
          targetWeightKg: item.targetWeightKg,
          targetDurationSeconds: null,
          targetDistanceMeters: null,
        },
        series:
          item.series?.map((t) => ({
            ...t,
            targetDurationSeconds: null,
            targetDistanceMeters: null,
          })) ?? null,
      },
      note: item.note,
      restSeconds: item.restSeconds,
      supersetId: item.supersetId,
      supersetRestSeconds: item.supersetRestSeconds,
    })),
  });
}
export function upgradePersonalLibrary(
  input: import("./personal-contracts").PersonalLibrary,
): TypedPersonalLibrary {
  const legacy = personalLibrarySchema.parse(input);
  return typedPersonalLibrarySchema.parse({
    ...legacy,
    version: 2,
    routines: legacy.routines.map(upgradePersonalRoutine),
  });
}
