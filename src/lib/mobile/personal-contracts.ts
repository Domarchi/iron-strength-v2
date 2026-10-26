import { z } from "zod";
import { LIMITS } from "../../domain/limits";
import {
  coherentPrescriptionSeries,
  prescribedSeriesSchema,
} from "../../domain/prescription-series";
import { validRestSeconds, validSupersetLayout } from "../../domain/supersets";
import { mobileCatalogEntrySchema } from "./exercise-contracts";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().nonnegative();
const name = z.string().trim().min(1).max(LIMITS.nameMax);
const rest = z.number().int().nullable().refine(validRestSeconds);
const weight = z
  .number()
  .min(0)
  .max(LIMITS.weightMaxKg)
  .refine((value) => Math.round(value * 100) / 100 === value)
  .nullable();
const itemFields = {
  id: uuid,
  exerciseId: uuid,
  sets: z.number().int().min(LIMITS.setsMin).max(LIMITS.setsMax),
  repsMin: z.number().int().min(LIMITS.repsMin).max(LIMITS.repsMax),
  repsMax: z.number().int().min(LIMITS.repsMin).max(LIMITS.repsMax),
  targetWeightKg: weight,
  note: z.string().max(LIMITS.noteMax),
  restSeconds: rest,
  supersetId: uuid.nullable(),
  supersetRestSeconds: rest,
  series: prescribedSeriesSchema.nullable(),
};
const coherent = (item: z.infer<typeof personalItemInputSchema>) =>
  item.repsMin <= item.repsMax && coherentPrescriptionSeries(item);
export const personalItemInputSchema = z.object(itemFields).strict();
const validItems = (items: z.infer<typeof personalItemInputSchema>[]) =>
  items.every(coherent) && validSupersetLayout(items.map((item) => ({ ...item, name: "" })));
const items = z.array(personalItemInputSchema).max(LIMITS.exercisesPerSession).refine(validItems);
const entries = z
  .array(z.object({ id: uuid, revision }).strict())
  .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length);
const common = { version: z.literal(1), requestId: uuid, targetId: uuid };
const edit = { ...common, expectedRevision: revision };
const create = { ...common, expectedRevision: z.literal(0) };
const reorder = { ...common, expectedRevision: z.null() };
export const personalMutationSchema = z.discriminatedUnion("operation", [
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
export type PersonalMutation = z.infer<typeof personalMutationSchema>;
const snapshotItem = mobileCatalogEntrySchema.omit({ id: true }).extend({
  ...itemFields,
  position: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.exercisesPerSession - 1),
});
const routine = z.object({
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
});
export const personalLibrarySchema = z
  .object({
    version: z.literal(1),
    userId: uuid,
    folders: z.array(
      z.object({ id: uuid, name, position: z.number().int().nonnegative(), revision }),
    ),
    routines: z.array(routine),
  })
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
export type PersonalLibrary = z.infer<typeof personalLibrarySchema>;
export type PersonalRoutine = PersonalLibrary["routines"][number];
export type PersonalItemInput = z.infer<typeof personalItemInputSchema>;
export const personalMutationResultSchema = z.object({
  requestId: uuid,
  targetId: uuid,
  revision: revision.nullable(),
  status: z.enum(["created", "updated", "deleted", "copied", "moved", "reordered", "removed"]),
  duplicate: z.boolean(),
});
export type PersonalMutationResult = z.infer<typeof personalMutationResultSchema>;
