import { describe, expect, it } from "vitest";
import { personalLibrarySchema, personalMutationSchema } from "./personal-contracts";
export const personalId = (n: number) => `ac210000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const personalItem = (n = 1) => ({
  id: personalId(n),
  exerciseId: personalId(100),
  sets: 2,
  repsMin: 8,
  repsMax: 12,
  targetWeightKg: 30,
  note: "",
  restSeconds: 90,
  supersetId: null,
  supersetRestSeconds: null,
  series: null,
});
export const personalLibrary = () => ({
  version: 1,
  userId: personalId(900),
  folders: [],
  routines: [
    {
      id: personalId(10),
      name: "Fuerza",
      folderId: null,
      position: 0,
      revision: 3,
      createdAt: "2026-10-26T10:00:00Z",
      updatedAt: "2026-10-26T10:00:00Z",
      items: [
        {
          ...personalItem(),
          name: "Press",
          muscleGroup: "Pecho",
          equipment: null,
          isBodyweight: false,
          progressionIncrementKg: 2.5,
          position: 0,
        },
      ],
    },
  ],
});
const create = () => ({
  version: 1,
  requestId: personalId(50),
  operation: "routine_create",
  targetId: personalId(10),
  expectedRevision: 0,
  data: { name: "Fuerza", folderId: null, items: [personalItem()] },
});
describe("contratos de biblioteca privada", () => {
  it("acepta vacía, uniforme y por serie sin exigir revisión inicial fija", () => {
    expect(
      personalLibrarySchema.safeParse({
        version: 1,
        userId: personalId(900),
        folders: [],
        routines: [],
      }).success,
    ).toBe(true);
    expect(personalLibrarySchema.safeParse(personalLibrary()).success).toBe(true);
    const input = create();
    expect(personalMutationSchema.safeParse(input).success).toBe(true);
    const item = {
      ...personalItem(),
      targetWeightKg: null,
      series: [
        { repsMin: 8, repsMax: 10, targetWeightKg: 30 },
        { repsMin: 10, repsMax: 12, targetWeightKg: 25 },
      ],
    };
    expect(
      personalMutationSchema.safeParse({ ...input, data: { ...input.data, items: [item] } })
        .success,
    ).toBe(true);
    expect(
      personalMutationSchema.safeParse({ ...input, data: { ...input.data, items: [] } }).success,
    ).toBe(true);
  });
  it("cierra operaciones, propietario, campos y límites antes de escribir", () => {
    const input = create();
    for (const change of [
      { version: 2 },
      { operation: "assign_program" },
      { ownerId: personalId(901) },
      { expectedRevision: 1 },
      { targetId: "bad" },
      { data: { ...input.data, extra: true } },
      { data: { ...input.data, items: [{ ...personalItem(), position: 0 }] } },
      { data: { ...input.data, items: Array.from({ length: 16 }, (_, i) => personalItem(i + 1)) } },
    ])
      expect(personalMutationSchema.safeParse({ ...input, ...change }).success).toBe(false);
    for (const change of [
      { sets: 0 },
      { sets: 11 },
      { repsMin: 13 },
      { repsMax: 101 },
      { targetWeightKg: 501 },
      { targetWeightKg: 0.001 },
      { restSeconds: 1 },
      { note: "a".repeat(501) },
      { series: [{ repsMin: 8, repsMax: 12, targetWeightKg: 30 }] },
    ])
      expect(
        personalMutationSchema.safeParse({
          ...input,
          data: { ...input.data, items: [{ ...personalItem(), ...change }] },
        }).success,
      ).toBe(false);
  });
  it("grupos exigen 2–4 consecutivos y descanso común; ids de filas únicos", () => {
    const input = create(),
      group = personalId(77);
    const items = [1, 2].map((n) => ({
      ...personalItem(n),
      supersetId: group,
      supersetRestSeconds: 60,
    }));
    expect(
      personalMutationSchema.safeParse({ ...input, data: { ...input.data, items } }).success,
    ).toBe(true);
    for (const bad of [
      [items[0]],
      [items[0], personalItem(3), items[1]],
      [items[0], { ...items[1], supersetRestSeconds: 90 }],
      [personalItem(), personalItem()],
    ])
      expect(
        personalMutationSchema.safeParse({ ...input, data: { ...input.data, items: bad } }).success,
      ).toBe(false);
  });
  it("órdenes exigen revisión individual y revisión de conjunto nula", () => {
    const input = {
      version: 1,
      requestId: personalId(50),
      targetId: personalId(900),
      operation: "routines_reorder",
      expectedRevision: null,
      data: { folderId: null, entries: [{ id: personalId(10), revision: 8 }] },
    };
    expect(personalMutationSchema.safeParse(input).success).toBe(true);
    expect(personalMutationSchema.safeParse({ ...input, expectedRevision: 0 }).success).toBe(false);
    expect(
      personalMutationSchema.safeParse({
        ...input,
        data: { folderId: null, entries: [{ id: personalId(10) }] },
      }).success,
    ).toBe(false);
  });
  it("snapshot rechaza versiones, ids repetidos, padre ausente y orden de filas incompleto", () => {
    const value = personalLibrary();
    expect(personalLibrarySchema.safeParse({ ...value, version: 2 }).success).toBe(false);
    expect(
      personalLibrarySchema.safeParse({
        ...value,
        routines: [...value.routines, ...value.routines],
      }).success,
    ).toBe(false);
    expect(
      personalLibrarySchema.safeParse({
        ...value,
        routines: [{ ...value.routines[0], folderId: personalId(99) }],
      }).success,
    ).toBe(false);
    expect(
      personalLibrarySchema.safeParse({
        ...value,
        routines: [
          { ...value.routines[0], items: [{ ...value.routines[0].items[0], position: 1 }] },
        ],
      }).success,
    ).toBe(false);
  });
});
