import { describe, expect, it } from "vitest";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import type { EditorDraft } from "./editor-draft";
import type { CoachSessionRow, CoachCatalogExercise } from "@/lib/data/coach-programs";
import {
  coachEditorBase,
  coachEditorDraftSchema,
  decodeCoachEditorDraft,
  coachEditorDraftKey,
  migrateCoachEditorDraft,
  writeCoachEditorDraft,
  type CoachEditorDraft,
  type CoachEditorStorage,
} from "./typed-editor-draft";

const scope = {
  userId: crypto.randomUUID(),
  programId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
};
const draftId = crypto.randomUUID(),
  rowId = crypto.randomUUID(),
  exerciseId = crypto.randomUUID();
const original: EditorDraft = {
  version: 3,
  ...scope,
  id: draftId,
  revision: 2,
  updatedAt: "2026-10-28T12:00:00.000Z",
  edits: {
    [rowId]: {
      id: rowId,
      exerciseId,
      sets: "",
      repsMin: "8",
      repsMax: "12",
      targetWeightKg: "12,35",
      note: "Pausa",
    },
  },
  order: null,
  orderRequest: null,
  saveRequest: null,
  copyRequest: null,
};
const source: CoachSessionRow = {
  id: scope.sessionId,
  revision: 2,
  title: null,
  weekday: null,
  weekNumber: 1,
  label: "A",
  position: 0,
  exercises: [
    {
      id: rowId,
      exerciseId,
      name: "Ejercicio",
      muscleGroup: "Core",
      equipment: null,
      isBodyweight: false,
      incrementKg: 2.5,
      archived: false,
      recordType: null,
      prescribed: parsePrescriptionInput(defaultPrescriptionInput(null)),
      note: null,
      restSeconds: 90,
      supersetId: null,
      supersetRestSeconds: null,
      position: 0,
      alternatives: [],
    },
  ],
};
const catalog: CoachCatalogExercise[] = [
  { id: exerciseId, name: "Ejercicio", muscleGroup: "Core", equipment: null, recordType: null },
];
function migrated(old: EditorDraft = original) {
  const raw = JSON.stringify(old),
    entry = decodeCoachEditorDraft(raw, scope);
  if (entry.kind !== "legacy") throw Error("fixture");
  return migrateCoachEditorDraft(entry, source, catalog);
}
function current(): CoachEditorDraft {
  const result = migrated();
  if (!result.ok) throw Error("fixture");
  return result.draft;
}
function store(initial: string | null = null) {
  let value = initial;
  const storage: CoachEditorStorage = {
    get: async () => value,
    compareAndSet: async (_key, before, next) => {
      if (value !== before) throw Object.assign(Error("conflict"), { reason: "conflict" });
      value = next;
    },
  };
  return {
    storage,
    read: () => value,
    replace: (raw: string | null) => {
      value = raw;
    },
  };
}
describe("T219 · borrador canónico del coach", () => {
  it("conserva una base de comparación canónica vinculada a la misma revisión", () => {
    const value = current(),
      base = coachEditorBase(source);
    expect(coachEditorDraftSchema.parse({ ...value, base }).base).toEqual(base);
    expect(
      coachEditorDraftSchema.safeParse({ ...value, base: { ...base, revision: 9 } }).success,
    ).toBe(false);
    expect(
      coachEditorDraftSchema.safeParse({
        ...value,
        base: { ...base, exercises: [...base.exercises, base.exercises[0]] },
      }).success,
    ).toBe(false);
    expect(coachEditorDraftSchema.safeParse(value).success).toBe(true);
  });
  it("migra texto parcial y conserva el original exacto sin cambiar revisión o identidad", () => {
    const result = migrated();
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("fixture");
    expect(result.draft).toMatchObject({
      version: 4,
      ...scope,
      id: draftId,
      revision: 2,
      previousRaw: JSON.stringify(original),
      edits: {
        [rowId]: {
          id: rowId,
          exerciseId,
          note: "Pausa",
          targets: {
            kind: "replace",
            input: {
              mode: "uniform",
              recordType: null,
              sets: "",
              target: { targetWeightKg: "12,35" },
            },
          },
        },
      },
    });
    expect(decodeCoachEditorDraft(JSON.stringify(result.draft), scope).kind).toBe("current");
  });
  it("no adapta el cuerpo ni la identidad de ninguna operación anterior congelada", () => {
    const request = { id: crypto.randomUUID(), revision: 2 };
    const variants: EditorDraft[] = [
      { ...original, saveRequest: { ...request, rows: Object.values(original.edits) } },
      { ...original, orderRequest: request, order: [rowId] },
      { ...original, copyRequest: { id: crypto.randomUUID(), exerciseId: rowId } },
      {
        ...original,
        layoutRequest: {
          ...request,
          layout: [{ id: rowId, restSeconds: 90, supersetId: null, supersetRestSeconds: null }],
        },
      },
      { ...original, alternativeRequest: { ...request, exerciseRowId: rowId, alternatives: [] } },
      {
        ...original,
        additionRequest: { ...request, items: [{ id: crypto.randomUUID(), exerciseId }] },
        additionSelection: [exerciseId],
      },
    ];
    for (const old of variants) {
      const result = migrated(old);
      expect(result).toMatchObject({ ok: false, reason: "pending" });
      if (!result.ok) expect(result.entry.raw).toBe(JSON.stringify(old));
    }
  });
  it("distingue formatos desconocidos, corrupción, cuenta ajena y campos futuros sin modificarlos", () => {
    for (const raw of [
      "not-json",
      JSON.stringify({ ...original, version: 99 }),
      JSON.stringify({ ...original, userId: crypto.randomUUID() }),
      JSON.stringify({
        ...original,
        edits: { [rowId]: { ...original.edits[rowId], future: true } },
      }),
    ]) {
      const result = decodeCoachEditorDraft(raw, scope);
      expect(result.kind).toBe("unknown");
      expect(result).toHaveProperty("raw", raw);
    }
    expect(decodeCoachEditorDraft(null, scope).kind).toBe("empty");
  });
  it("conserva los tres formatos previos reconocidos sin agregarles campos", () => {
    for (const version of [1, 2, 3]) {
      const raw = JSON.stringify({ ...original, version });
      expect(decodeCoachEditorDraft(raw, scope)).toMatchObject({
        kind: "legacy",
        raw,
        draft: { version },
      });
    }
  });
  it("no cambia silenciosamente una prescripción moderna ni pierde filas desaparecidas", () => {
    const entry = decodeCoachEditorDraft(JSON.stringify(original), scope);
    if (entry.kind !== "legacy") throw Error("fixture");
    expect(migrateCoachEditorDraft(entry, { ...source, exercises: [] }, catalog)).toMatchObject({
      ok: false,
      reason: "incompatible",
    });
    const modern = {
      ...source,
      exercises: [
        {
          ...source.exercises[0],
          prescribed: parsePrescriptionInput(defaultPrescriptionInput("duration")),
          recordType: "duration" as const,
        },
      ],
    };
    expect(migrateCoachEditorDraft(entry, modern, catalog)).toMatchObject({
      ok: false,
      reason: "incompatible",
    });
    expect(migrateCoachEditorDraft(entry, { ...source, revision: 9 }, catalog)).toMatchObject({
      ok: true,
      draft: { revision: 2 },
    });
  });
  it("migra detalle y campos seleccionados preservando lo no elegido", () => {
    const old = {
      ...original,
      edits: {
        [rowId]: {
          ...original.edits[rowId],
          sets: "2",
          series: [
            { repsMin: "6", repsMax: "8", targetWeightKg: "0" },
            { repsMin: "8", repsMax: "12", targetWeightKg: "20,5" },
          ],
        },
      },
    };
    const result = migrated(old);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("fixture");
    expect(result.draft.edits[rowId].targets).toMatchObject({
      kind: "replace",
      input: { mode: "series", series: [{ targetWeightKg: "0" }, { targetWeightKg: "20,5" }] },
    });
    const selected = migrated({
      ...original,
      edits: { [rowId]: { ...original.edits[rowId], sets: "4", fields: ["sets"] } },
    });
    expect(selected).toMatchObject({
      ok: true,
      draft: { edits: { [rowId]: { targets: { kind: "patch", changes: { sets: 4 } } } } },
    });
    if (selected.ok) expect(selected.draft.edits[rowId]).not.toHaveProperty("note");
  });
  it("retiene el formato anterior cuando el detalle o parche incompleto no son representables", () => {
    const series = [{ repsMin: "8", repsMax: "12", targetWeightKg: "20" }];
    expect(
      migrated({ ...original, edits: { [rowId]: { ...original.edits[rowId], sets: "", series } } }),
    ).toMatchObject({ ok: false, reason: "incompatible" });
    expect(
      migrated({ ...original, edits: { [rowId]: { ...original.edits[rowId], fields: ["sets"] } } }),
    ).toMatchObject({ ok: false, reason: "incompatible" });
  });
  it("migra lote, selección de catálogo, título/día y alternativas incompletas", () => {
    const alt = crypto.randomUUID();
    const old: EditorDraft = {
      ...original,
      title: "Técnica",
      weekday: 0,
      additionSelection: [exerciseId],
      bulk: {
        ids: [rowId],
        setsEnabled: true,
        repsEnabled: false,
        restEnabled: true,
        sets: "",
        repsMin: "8",
        repsMax: "12",
        restSeconds: "120",
      },
      alternativeEdits: {
        [rowId]: [
          { exerciseId: alt, sets: "", repsMin: "8", repsMax: "12", targetWeightKg: "20," },
        ],
      },
    };
    const entry = decodeCoachEditorDraft(JSON.stringify(old), scope);
    if (entry.kind !== "legacy") throw Error("fixture");
    const result = migrateCoachEditorDraft(entry, source, [
      ...catalog,
      { id: alt, name: "Alternativa", recordType: null, muscleGroup: "Core", equipment: null },
    ]);
    expect(result).toMatchObject({
      ok: true,
      draft: {
        title: "Técnica",
        weekday: 0,
        selection: [rowId],
        additionSelection: [exerciseId],
        bulk: { ids: [rowId], fields: { sets: "", restSeconds: "120" } },
        alternatives: {
          [rowId]: [
            {
              exerciseId: alt,
              input: { mode: "uniform", sets: "", target: { targetWeightKg: "20," } },
            },
          ],
        },
      },
    });
  });
  it("mantiene cerrado el formato4, el alcance y la petición estable", () => {
    const value = current();
    const pending = {
      version: 2,
      id: crypto.randomUUID(),
      revision: 2,
      operation: "prescribe",
      data: { rows: [], title: "Título" },
    };
    const parsed = coachEditorDraftSchema.parse({ ...value, pending });
    expect(parsed.pending).toEqual(pending);
    for (const invalid of [
      { ...value, extra: true },
      { ...value, revision: 3, pending },
      { ...value, edits: { [crypto.randomUUID()]: value.edits[rowId] } },
      { ...value, previousRaw: JSON.stringify({ ...original, userId: crypto.randomUUID() }) },
    ])
      expect(coachEditorDraftSchema.safeParse(invalid).success).toBe(false);
  });
  it("escribe y relee antes de acreditar una migración; la clave mantiene el alcance existente", async () => {
    const raw = JSON.stringify(original),
      target = store(raw),
      value = current();
    expect(coachEditorDraftKey(value)).toBe(
      `is:coach-draft:v1:${scope.userId}:${scope.programId}:${scope.sessionId}:${draftId}`,
    );
    const saved = await writeCoachEditorDraft(target.storage, value, raw);
    expect(saved.ok).toBe(true);
    expect(target.read()).toBe(JSON.stringify(value));
    expect(raw).not.toBe(target.read());
  });
  it("no sobrescribe una segunda pestaña o un formato desconocido", async () => {
    const raw = JSON.stringify(original),
      target = store(raw),
      value = current();
    target.replace(JSON.stringify({ ...original, updatedAt: "2026-10-28T13:00:00.000Z" }));
    expect(await writeCoachEditorDraft(target.storage, value, raw)).toMatchObject({
      ok: false,
      reason: "conflict",
    });
    const unknown = JSON.stringify({ ...original, version: 99 });
    target.replace(unknown);
    expect(await writeCoachEditorDraft(target.storage, value, unknown)).toMatchObject({
      ok: false,
      reason: "unknown",
    });
    expect(target.read()).toBe(unknown);
  });
  it("el escritor no puede convertir una petición anterior pendiente ni retirar su original durante la migración", async () => {
    const pending = JSON.stringify({
      ...original,
      copyRequest: { id: crypto.randomUUID(), exerciseId: rowId },
    });
    const target = store(pending);
    expect(
      await writeCoachEditorDraft(target.storage, { ...current(), previousRaw: null }, pending),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(target.read()).toBe(pending);
    const raw = JSON.stringify(original);
    target.replace(raw);
    expect(
      await writeCoachEditorDraft(target.storage, { ...current(), previousRaw: null }, raw),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(target.read()).toBe(raw);
  });
  it("cuota y relectura fallida conservan el origen; reintenta un commit local incierto sin otro cambio", async () => {
    const raw = JSON.stringify(original),
      target = store(raw),
      value = current();
    const quota = {
      ...target.storage,
      compareAndSet: async () => {
        throw Error("quota");
      },
    };
    expect(await writeCoachEditorDraft(quota, value, raw)).toMatchObject({
      ok: false,
      reason: "storage",
    });
    expect(target.read()).toBe(raw);
    let failRead = false;
    const uncertain: CoachEditorStorage = {
      get: async (key) => {
        if (failRead) {
          failRead = false;
          throw Error("read");
        }
        return target.storage.get(key);
      },
      compareAndSet: async (...args) => {
        await target.storage.compareAndSet(...args);
        failRead = true;
      },
    };
    expect(await writeCoachEditorDraft(uncertain, value, raw)).toMatchObject({
      ok: false,
      reason: "storage",
    });
    expect(await writeCoachEditorDraft(target.storage, value, raw)).toMatchObject({
      ok: true,
      raw: JSON.stringify(value),
    });
  });
  it("una escritura perdida o una carrera en CAS nunca acredita protección", async () => {
    const value = current(),
      target = store(null);
    expect(
      await writeCoachEditorDraft(
        { ...target.storage, compareAndSet: async () => {} },
        value,
        null,
      ),
    ).toMatchObject({ ok: false, reason: "storage" });
    expect(
      await writeCoachEditorDraft(
        {
          ...target.storage,
          compareAndSet: async () => {
            throw Object.assign(Error("race"), { reason: "conflict" });
          },
        },
        value,
        null,
      ),
    ).toMatchObject({ ok: false, reason: "conflict" });
  });
  it("dos escritores con la misma base confirman solo un borrador y conservan el otro intento en memoria", async () => {
    const value = current(),
      raw = JSON.stringify(value),
      target = store(raw);
    const proposals = [
      { ...value, title: "Primera" },
      { ...value, title: "Segunda" },
    ];
    const results = await Promise.all(
      proposals.map((proposal) => writeCoachEditorDraft(target.storage, proposal, raw)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "conflict" }]);
    expect(proposals.map((proposal) => proposal.title)).toEqual(["Primera", "Segunda"]);
  });
  it("no reemplaza una petición canónica incierta sin resolver explícitamente ese mismo intento", async () => {
    const value: CoachEditorDraft = {
      ...current(),
      pending: {
        version: 2,
        id: crypto.randomUUID(),
        revision: 2,
        operation: "prescribe",
        data: { rows: [], title: "A" },
      },
    };
    const raw = JSON.stringify(value),
      target = store(raw);
    const replacement = { ...value, pending: { ...value.pending!, id: crypto.randomUUID() } };
    expect(await writeCoachEditorDraft(target.storage, replacement, raw)).toMatchObject({
      ok: false,
      reason: "pending",
    });
    expect(
      await writeCoachEditorDraft(target.storage, { ...value, pending: null }, raw),
    ).toMatchObject({ ok: false, reason: "pending" });
    expect(
      await writeCoachEditorDraft(target.storage, { ...value, pending: null }, raw, {
        settledRequestId: crypto.randomUUID(),
      }),
    ).toMatchObject({ ok: false, reason: "pending" });
    expect(target.read()).toBe(raw);
    expect(
      await writeCoachEditorDraft(target.storage, { ...value, pending: null }, raw, {
        settledRequestId: value.pending!.id,
      }),
    ).toMatchObject({ ok: true });
  });
});
