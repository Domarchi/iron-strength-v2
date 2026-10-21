import { z } from "zod";
export const additionRequestSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    items: z
      .array(z.object({ id: z.uuid(), exerciseId: z.uuid() }).strict())
      .min(1)
      .max(15),
  })
  .strict()
  .refine(
    (r) =>
      new Set(r.items.map((i) => i.id)).size === r.items.length &&
      new Set(r.items.map((i) => i.exerciseId)).size === r.items.length,
  );
export type AdditionRequest = z.infer<typeof additionRequestSchema>;
