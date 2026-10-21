import { expect, it } from "vitest";
import { additionRequestSchema } from "./routine-additions";
it("valida revisión, identidad estable y miembros únicos antes de enviar", () => {
  const row = { id: crypto.randomUUID(), exerciseId: crypto.randomUUID() };
  const request = { id: crypto.randomUUID(), revision: 0, items: [row] };
  expect(additionRequestSchema.safeParse(request).success).toBe(true);
  for (const value of [
    { ...request, revision: -1 },
    { ...request, items: [] },
    { ...request, items: [row, row] },
    { ...request, items: [row, { ...row, id: crypto.randomUUID() }] },
  ])
    expect(additionRequestSchema.safeParse(value).success).toBe(false);
});
