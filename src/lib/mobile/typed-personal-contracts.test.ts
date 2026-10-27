import { describe, expect, it } from "vitest";
import {
  RECORD_TYPES,
  trainingTargetSummary,
  type RecordType,
} from "../../domain/training-metrics";
import { personalLibrarySchema, personalMutationSchema } from "./personal-contracts";
import {
  typedPersonalItemSchema,
  typedPersonalLibrarySchema,
  typedPersonalMutationSchema,
  typedPersonalMutationResultSchema,
} from "./typed-personal-contracts";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = (kind: RecordType) => ({
  repsMin: kind === null || kind.includes("reps") || kind.includes("bodyweight") ? 8 : null,
  repsMax: kind === null || kind.includes("reps") || kind.includes("bodyweight") ? 12 : null,
  targetWeightKg:
    kind === null ||
    [
      "weight_reps",
      "weighted_bodyweight",
      "assisted_bodyweight",
      "weight_duration",
      "weight_distance",
    ].includes(kind)
      ? 20
      : null,
  targetDurationSeconds: kind?.includes("duration") ? 60 : null,
  targetDistanceMeters: kind?.includes("distance") ? 100 : null,
});
const item = (kind: RecordType = "duration") => ({
  id: id(1),
  exerciseId: id(2),
  prescribed: { recordType: kind, sets: 2, target: target(kind), series: null },
  note: "",
  restSeconds: 90,
  supersetId: null,
  supersetRestSeconds: null,
});
const mutation = (kind: RecordType = "duration") => ({
  version: 2,
  requestId: id(3),
  targetId: id(4),
  expectedRevision: 0,
  operation: "routine_create",
  data: { name: "Tiempo", folderId: null, items: [item(kind)] },
});
const library = () => ({
  version: 2,
  userId: id(5),
  folders: [],
  routines: [
    {
      id: id(4),
      name: "Tiempo",
      folderId: null,
      position: 0,
      revision: 1,
      createdAt: "2026-10-27T12:00:00Z",
      updatedAt: "2026-10-27T12:00:00Z",
      items: [
        {
          ...item(),
          recordType: "duration",
          position: 0,
          name: "Plancha",
          muscleGroup: "Pecho",
          equipment: "bodyweight",
          isBodyweight: true,
          progressionIncrementKg: 2.5,
        },
      ],
    },
  ],
});
describe("biblioteca personal tipada2", () => {
  it.each([null, ...RECORD_TYPES])("conserva únicamente objetivos de %s", (kind) => {
    expect(typedPersonalMutationSchema.parse(mutation(kind)).data).toEqual(mutation(kind).data);
  });
  it("mantiene los contratos anteriores cerrados", () => {
    expect(personalMutationSchema.safeParse(mutation()).success).toBe(false);
    expect(personalLibrarySchema.safeParse(library()).success).toBe(false);
    expect(typedPersonalMutationSchema.safeParse({ ...mutation(), version: 1 }).success).toBe(
      false,
    );
  });
  it("no acepta reps ficticias, claves desconocidas ni tipo ausente", () => {
    for (const value of [
      { ...item(), prescribed: { ...item().prescribed, target: target(null) } },
      { ...item(), effort: 8 },
      { ...item(), exerciseNote: "propia" },
      { ...item(), prescribed: { sets: 2, target: target("duration"), series: null } },
    ])
      expect(typedPersonalItemSchema.safeParse(value).success).toBe(false);
  });
  it("admite detalle coherente y rechaza resumen distinto", () => {
    const series = [target("duration"), { ...target("duration"), targetDurationSeconds: 90 }];
    const prescribed = {
      recordType: "duration",
      sets: 2,
      target: trainingTargetSummary(series),
      series,
    };
    expect(typedPersonalItemSchema.safeParse({ ...item(), prescribed }).success).toBe(true);
    expect(
      typedPersonalItemSchema.safeParse({
        ...item(),
        prescribed: { ...prescribed, target: target("duration") },
      }).success,
    ).toBe(false);
  });
  it("cuenta notas por caracteres Unicode y conserva límites", () => {
    expect(typedPersonalItemSchema.safeParse({ ...item(), note: "🏋".repeat(500) }).success).toBe(
      true,
    );
    expect(typedPersonalItemSchema.safeParse({ ...item(), note: "🏋".repeat(501) }).success).toBe(
      false,
    );
    expect(
      typedPersonalItemSchema.safeParse({
        ...item(),
        prescribed: { ...item().prescribed, sets: 11 },
      }).success,
    ).toBe(false);
  });
  it("rechaza IDs duplicados y grupos incompletos", () => {
    const value = mutation();
    expect(
      typedPersonalMutationSchema.safeParse({
        ...value,
        data: { ...value.data, items: [item(), item()] },
      }).success,
    ).toBe(false);
    expect(
      typedPersonalMutationSchema.safeParse({
        ...value,
        data: { ...value.data, items: [{ ...item(), supersetId: id(8) }] },
      }).success,
    ).toBe(false);
  });
  it("exige metadata coincidente y snapshot cerrado", () => {
    expect(typedPersonalLibrarySchema.safeParse(library()).success).toBe(true);
    const value = library();
    value.routines[0].items[0].recordType = "weight_reps";
    expect(typedPersonalLibrarySchema.safeParse(value).success).toBe(false);
    expect(typedPersonalLibrarySchema.safeParse({ ...library(), ownerId: id(7) }).success).toBe(
      false,
    );
  });
  it("confirma explícitamente versión2 sin aceptar confirmación antigua", () => {
    const result = {
      requestId: id(3),
      targetId: id(4),
      revision: 1,
      status: "created",
      duplicate: false,
    };
    expect(typedPersonalMutationResultSchema.safeParse(result).success).toBe(false);
    expect(typedPersonalMutationResultSchema.safeParse({ ...result, version: 2 }).success).toBe(
      true,
    );
  });
});
