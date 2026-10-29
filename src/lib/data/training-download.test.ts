import { assignedTrainingFixture } from "../../test/fixtures/assigned-training";
import { assignedContextSchema } from "../workout/training-context";
import { trainingHistorySourceSchema } from "../../domain/training-history";
import { defaultPrescriptionInput, parsePrescriptionInput } from "../../domain/prescription-input";
import { typedCatalogSchema, type TypedCatalogEntry } from "../mobile/typed-exercise-contracts";
import { typedPersonalLibrarySchema } from "../mobile/typed-personal-contracts";
import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { trainingHistoryFixture } from "../../test/fixtures/training-history";
import {
  projectTrainingDownload,
  readTrainingDownload,
  TrainingDownloadError,
} from "./training-download";
const id = (n: number) => `af219000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const history = trainingHistoryFixture();
  return {
    version: 1,
    userId: history.student.id,
    downloadedAt: "2026-10-29T15:00:00Z",
    catalog: typedCatalogSchema.parse({
      version: 2,
      exercises: history.workouts[0].sets.map((s) => ({
        id: s.exerciseId,
        name: s.name,
        muscleGroup: "Core",
        equipment: null,
        isBodyweight: false,
        progressionIncrementKg: 2.5,
        recordType: s.metrics.recordType,
      })),
    }),
    library: typedPersonalLibrarySchema.parse({
      version: 2,
      userId: history.student.id,
      folders: [],
      routines: [],
    }),
    week: null,
    references: [] as TypedCatalogEntry[],
    history,
  };
}
it("proyecta nueve contratos, notas por posición y series sin convertir dimensiones", () => {
  const s = fixture(),
    b = projectTrainingDownload(s, s.userId);
  expect(b.week).toBeNull();
  expect(b.catalog.exercises).toHaveLength(9);
  for (const [i, e] of b.catalog.exercises.entries()) {
    const h = b.history[e.id];
    expect(h.history.items).toHaveLength(1);
    expect(h.history.items[0].sets[0].metrics).toEqual(s.history.workouts[0].sets[i].metrics);
    expect(h.history.items[0].exerciseNotes.map((n) => n.position)).toEqual(i === 0 ? [0, 9] : [i]);
  }
  expect(b.history[id(200)].history.items[0].exerciseNotes[1].note).toBe("Nota sin series");
});
it("diez resultados con cursor conservan empates y todas sus series, no diez filas sueltas", () => {
  const s = fixture(),
    w = s.history.workouts[0];
  s.history.workouts = Array.from({ length: 12 }, (_, i) => ({
    ...w,
    id: id(1000 + i),
    sets: w.sets.map((v, j) => ({ ...v, id: id(2000 + i * 20 + j) })),
  }));
  const h = projectTrainingDownload(s, s.userId).history[id(200)].history;
  expect(h.items).toHaveLength(10);
  expect(h.items[0].id).toBe(id(1011));
  expect(h.items[9].id).toBe(id(1002));
  expect(h.nextCursor).toBe(`${w.startedAt}|${id(1002)}`);
});
it("vacío descargado difiere de ejercicio omitido; referencias archivadas quedan fuera de catálogo", () => {
  const s = fixture(),
    entry = s.catalog.exercises.pop()!;
  s.references.push(entry);
  s.library.routines.push({
    id: id(4000),
    name: "Archivada",
    folderId: null,
    position: 0,
    revision: 1,
    createdAt: s.downloadedAt,
    updatedAt: s.downloadedAt,
    items: [
      {
        ...entry,
        id: id(4001),
        exerciseId: entry.id,
        position: 0,
        prescribed: s.history.workouts[0].structure.exercises[8].prescribed,
        note: "Control",
        restSeconds: 60,
        supersetId: null,
        supersetRestSeconds: null,
      },
    ],
  });
  const b = projectTrainingDownload(s, s.userId);
  expect(b.catalog.exercises.some((e) => e.id === entry.id)).toBe(false);
  expect(b.history[entry.id].exercise).toEqual(entry);
  const noHistory = structuredClone(s);
  noHistory.history.workouts = [];
  expect(projectTrainingDownload(noHistory, s.userId).history[entry.id].history).toEqual({
    items: [],
    nextCursor: null,
  });
});
it("rechaza identidad, referencias omitidas, versiones desconocidas y fechas de otra instantánea", () => {
  const s = fixture();
  for (const value of [
    { ...s, userId: id(800) },
    { ...s, version: 2 },
    { ...s, history: { ...s.history, student: { ...s.history.student, id: id(800) } } },
    { ...s, library: { ...s.library, userId: id(800) } },
    { ...s, downloadedAt: "2026-10-30T15:00:00Z" },
    { ...s, accessToken: "secret" },
  ])
    expect(() => projectTrainingDownload(value, s.userId)).toThrow(TrainingDownloadError);
  expect(() => projectTrainingDownload(s, id(800))).toThrow(TrainingDownloadError);
});
it("una sola RPC autorizada; no hay lecturas de respaldo que entreguen un paquete parcial", async () => {
  const s = fixture(),
    rpc = vi.fn().mockResolvedValue({ data: s, error: null }),
    db = { rpc } as unknown as SupabaseClient<Database>;
  expect((await readTrainingDownload(db, s.userId)).userId).toBe(s.userId);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_own_training_download");
  for (const [code, result] of [
    ["0A000", "capacity"],
    ["42501", "unauthorized"],
    ["57014", "unavailable"],
  ]) {
    rpc.mockResolvedValue({ data: null, error: { code, message: "private details" } });
    await expect(readTrainingDownload(db, s.userId)).rejects.toMatchObject({ code: result });
  }
  rpc.mockResolvedValue({ data: { version: 99 }, error: null });
  await expect(readTrainingDownload(db, s.userId)).rejects.toMatchObject({ code: "incompatible" });
});
it("ordena precisión SQL de microsegundos antes del ID, también con offsets equivalentes", () => {
  const s = fixture(),
    w = s.history.workouts[0];
  s.history.workouts = [
    {
      ...w,
      id: id(1000),
      startedAt: "2026-10-26T12:00:00.000900Z",
      sets: w.sets.map((row, i) => ({ ...row, id: id(2000 + i) })),
    },
    {
      ...w,
      id: id(1001),
      startedAt: "2026-10-26T09:00:00.000100-03:00",
      sets: w.sets.map((row, i) => ({ ...row, id: id(3000 + i) })),
    },
  ];
  const items = projectTrainingDownload(s, s.userId).history[id(200)].history.items;
  expect(items.map((i) => i.id)).toEqual([id(1000), id(1001)]);
});

function assignedFixture() {
  const source = fixture(),
    context = assignedContextSchema.parse(assignedTrainingFixture());
  context.userId = source.userId;
  const choice = (index: number) => {
    const e = source.catalog.exercises[index];
    return {
      exerciseId: e.id,
      name: e.name,
      isBodyweight: e.isBodyweight,
      prescribed: parsePrescriptionInput(defaultPrescriptionInput(e.recordType)),
      lastMetrics: null,
    };
  };
  context.exercises = [
    { ...context.exercises[0], ...choice(5), alternatives: [choice(1), choice(6)] },
  ];
  const s = context.session;
  return {
    ...source,
    week: {
      program: {
        id: s.programId,
        name: s.programName,
        startDate: s.startDate,
        endsOn: s.endsOn,
        weeksCount: s.weeksCount,
      },
      weekNumber: s.weekNumber,
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
      sessionCount: 1,
      sessions: [{ weekday: 1, context }],
    },
  };
}
it("referencias por tipo: calentamiento no precarga, alternativas y series completas se conservan", () => {
  const s = assignedFixture(),
    b = projectTrainingDownload(s, s.userId),
    c = b.week!.sessions[0].context;
  expect(c.exercises[0].lastMetrics).toEqual(s.history.workouts[0].sets[5].metrics);
  expect(c.exercises[0].alternatives[0].lastMetrics).toBeNull();
  expect(c.exercises[0].alternatives[1].lastMetrics).toEqual(s.history.workouts[0].sets[6].metrics);
  expect(c.previousSets.map((r) => r.recordType)).toEqual(["duration", "weight_duration"]);
  expect(c.previousSets[0].sets[0]).toMatchObject({
    ...s.history.workouts[0].sets[5].metrics,
    setType: "working",
    effort: 8.5,
  });
  expect(c.exercises[0].prescribed).toEqual(s.week.sessions[0].context.exercises[0].prescribed);
});
it("consulta un resultado anterior con trabajo cuando el más reciente solo tiene calentamientos", () => {
  const s = assignedFixture(),
    h = trainingHistorySourceSchema.parse(s.history),
    w = structuredClone(h.workouts[0]);
  w.id = id(7000);
  w.startedAt = "2026-10-27T12:00:00Z";
  w.finishedAt = "2026-10-27T12:30:00Z";
  w.date = "2026-10-27";
  w.sets.forEach((row, i) => {
    row.id = id(7100 + i);
    row.setType = "warmup";
    row.effort = null;
  });
  const b = projectTrainingDownload(
    { ...s, history: { ...h, workouts: [w, ...h.workouts] } },
    s.userId,
  );
  expect(b.week!.sessions[0].context.exercises[0].lastMetrics?.durationSeconds).toBe(60);
  expect(b.history[id(205)].history.items[0].sets[0].setType).toBe("warmup");
});
it("un resultado de otro tipo no reemplaza la referencia del objetivo descargado", () => {
  const s = assignedFixture(),
    h = trainingHistorySourceSchema.parse(s.history),
    w = structuredClone(h.workouts[0]);
  w.id = id(7001);
  w.startedAt = "2026-10-27T12:00:00Z";
  w.finishedAt = "2026-10-27T12:30:00Z";
  w.date = "2026-10-27";
  w.sets.forEach((row, i) => {
    row.id = id(7200 + i);
  });
  w.sets[5].metrics = {
    recordType: "weight_duration",
    weightKg: 20,
    reps: null,
    durationSeconds: 90,
    distanceMeters: null,
  };
  if (w.structure?.version !== 2) throw Error("fixture");
  w.structure.exercises[5].prescribed = {
    ...w.structure.exercises[5].prescribed,
    recordType: "weight_duration",
    target: {
      repsMin: null,
      repsMax: null,
      targetWeightKg: 20,
      targetDurationSeconds: 90,
      targetDistanceMeters: null,
    },
  };
  const b = projectTrainingDownload(
    { ...s, history: { ...h, workouts: [w, ...h.workouts] } },
    s.userId,
  );
  expect(b.week!.sessions[0].context.exercises[0].lastMetrics).toEqual(
    h.workouts[0].sets[5].metrics,
  );
  expect(b.history[id(205)].history.items[0].sets[0].metrics.recordType).toBe("weight_duration");
});
it("semana con sesión vacía conserva revisión, sin inventar una referencia", () => {
  const s = assignedFixture();
  s.week.sessions[0].context.exercises = [];
  const c = projectTrainingDownload(s, s.userId).week!.sessions[0].context;
  expect(c.exercises).toEqual([]);
  expect(c.previousSets).toEqual([]);
  expect(c.session.revision).toBe(7);
});
it("metadatos duplicados, ajenos o una referencia omitida bloquean toda la descarga", () => {
  const s = assignedFixture(),
    entry = s.catalog.exercises[0];
  for (const value of [
    { ...s, references: [entry] },
    { ...s, references: [{ ...entry, id: id(9000) }] },
    { ...s, catalog: { version: 2, exercises: [] } },
  ])
    expect(() => projectTrainingDownload(value, s.userId)).toThrow(TrainingDownloadError);
});
