import { describe, expect, it } from "vitest";
import { trainingGuardKey } from "./training-guard";
import {
  clearDraft,
  draftKey,
  legacyDraftKey,
  listDrafts,
  loadDraft,
  saveDraft,
  type DraftStorage,
  type WorkoutDraft,
} from "./draft";

function fakeStorage(
  initial: Record<string, string> = {},
): DraftStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

const draft = (over: Partial<WorkoutDraft> = {}): WorkoutDraft => ({
  version: 2,
  workoutId: "11111111-1111-4111-8111-111111111111",
  userId: "user-a",
  plannedSessionId: "session-1",
  programId: "program-1",
  sessionLabel: "A",
  startedAt: "2026-10-07T15:00:00.000Z",
  updatedAt: "2026-10-07T15:10:00.000Z",
  status: "in_progress",
  exercises: [
    {
      sessionExerciseId: "se-1",
      exerciseId: "ex-1",
      name: "Sentadilla",
      isBodyweight: false,
      prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
      skipped: false,
      sets: [
        { id: "s1", weight: "60", reps: "10", done: true, isWarmup: false },
        { id: "s2", weight: "", reps: "", done: false, isWarmup: false },
      ],
    },
  ],
  ...over,
});

describe("borrador de la sesión en curso (RF-22, RF-24, DC-8)", () => {
  it("la guarda tipada propia impide otro escritor anterior, incluso si es desconocida", () => {
    const storage = fakeStorage();
    expect(saveDraft(storage, draft())).toBe(true);
    const before = storage.getItem(draftKey("user-a", "session-1"));
    storage.setItem(trainingGuardKey("user-a"), "future-guard");
    expect(saveDraft(storage, draft({ updatedAt: "2026-10-07T15:20:00.000Z" }))).toBe(false);
    expect(storage.getItem(draftKey("user-a", "session-1"))).toBe(before);
    expect(storage.getItem(trainingGuardKey("user-a"))).toBe("future-guard");
    storage.removeItem(trainingGuardKey("user-a"));
    storage.setItem(trainingGuardKey("user-b"), "other");
    expect(saveDraft(storage, draft())).toBe(true);
  });
  it("guarda y recupera el borrador tal cual", () => {
    const storage = fakeStorage();
    expect(saveDraft(storage, draft())).toBe(true);
    expect(loadDraft(storage, "user-a", "session-1")).toEqual(draft());
  });

  it("conserva el descanso y no pierde las series si solo el descanso está corrupto", () => {
    const storage = fakeStorage();
    const rest = { endsAt: 1792422090000, totalSeconds: 90 };
    storage.setItem(
      draftKey("user-a", "session-1"),
      JSON.stringify({ ...draft(), version: 1, rest }),
    );
    expect(loadDraft(storage, "user-a", "session-1")?.rest).toEqual(rest);
    storage.setItem(
      draftKey("user-a", "session-1"),
      JSON.stringify({ ...draft(), version: 1, rest: { endsAt: "roto" } }),
    );
    expect(loadDraft(storage, "user-a", "session-1")?.exercises).toEqual(draft().exercises);
    expect(loadDraft(storage, "user-a", "session-1")?.rest).toBeNull();
  });

  it("la clave incluye usuario y sesión: no se mezclan", () => {
    const storage = fakeStorage();
    saveDraft(storage, draft());
    expect(loadDraft(storage, "user-b", "session-1")).toBeNull();
    expect(loadDraft(storage, "user-a", "session-2")).toBeNull();
    expect(draftKey("user-a", "session-1")).not.toBe(draftKey("user-b", "session-1"));
  });

  it("devuelve null y conserva un borrador con JSON corrupto", () => {
    const storage = fakeStorage({ [draftKey("user-a", "session-1")]: "{no es json" });
    expect(loadDraft(storage, "user-a", "session-1")).toBeNull();
    expect(storage.data.size).toBe(1);
  });

  it("descarta un borrador de otra versión o con forma inválida", () => {
    const storage = fakeStorage();
    storage.setItem(draftKey("user-a", "session-1"), JSON.stringify({ ...draft(), version: 99 }));
    expect(loadDraft(storage, "user-a", "session-1")).toBeNull();
    storage.setItem(draftKey("user-a", "session-1"), JSON.stringify({ hola: "mundo" }));
    expect(loadDraft(storage, "user-a", "session-1")).toBeNull();
  });

  it("descarta un borrador cuyo usuario o sesión no coincide con su clave", () => {
    const storage = fakeStorage();
    storage.setItem(draftKey("user-a", "session-1"), JSON.stringify(draft({ userId: "user-b" })));
    expect(loadDraft(storage, "user-a", "session-1")).toBeNull();
  });

  it("clearDraft lo elimina", () => {
    const storage = fakeStorage();
    saveDraft(storage, draft());
    clearDraft(storage, "user-a", "session-1");
    expect(loadDraft(storage, "user-a", "session-1")).toBeNull();
  });

  it("conserva el id del entrenamiento para no duplicar al reintentar (DC-8)", () => {
    const storage = fakeStorage();
    saveDraft(
      storage,
      draft({
        status: "pending_save",
        finishedAt: "2026-10-07T16:00:00.000Z",
        durationSeconds: 3600,
      }),
    );
    const loaded = loadDraft(storage, "user-a", "session-1");
    expect(loaded?.workoutId).toBe("11111111-1111-4111-8111-111111111111");
    expect(loaded?.status).toBe("pending_save");
  });

  it("lista solo los borradores del usuario, ignorando otras claves", () => {
    const storage = fakeStorage({ otra: "cosa" });
    saveDraft(storage, draft());
    saveDraft(
      storage,
      draft({
        plannedSessionId: "session-2",
        sessionLabel: "B",
        workoutId: "11111111-1111-4111-8111-111111111113",
      }),
    );
    saveDraft(storage, draft({ userId: "user-b" }));
    expect(
      listDrafts(storage, "user-a")
        .map((d) => d.plannedSessionId)
        .sort(),
    ).toEqual(["session-1", "session-2"]);
  });

  describe("robustez del almacenamiento", () => {
    it("si guardar falla (cuota llena o modo privado), no lanza y avisa con false", () => {
      const broken: DraftStorage = {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("cuota", "QuotaExceededError");
        },
        removeItem: () => undefined,
        key: () => null,
        length: 0,
      };
      expect(saveDraft(broken, draft())).toBe(false);
    });

    it("si leer lanza, devuelve null", () => {
      const broken: DraftStorage = {
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => undefined,
        removeItem: () => undefined,
        key: () => null,
        length: 0,
      };
      expect(loadDraft(broken, "user-a", "session-1")).toBeNull();
      expect(listDrafts(broken, "user-a")).toEqual([]);
    });

    it("sin almacenamiento disponible (servidor) no hace nada", () => {
      expect(saveDraft(undefined, draft())).toBe(false);
      expect(loadDraft(undefined, "user-a", "session-1")).toBeNull();
      expect(listDrafts(undefined, "user-a")).toEqual([]);
      expect(() => clearDraft(undefined, "user-a", "session-1")).not.toThrow();
    });
  });
});

it("recupera grupo, descanso compartido y serie pendiente sin alterar borradores antiguos", () => {
  const store = fakeStorage(),
    value = draft();
  const group = "11111111-1111-4111-8111-111111111112";
  value.exercises[0] = {
    ...value.exercises[0],
    supersetId: group,
    supersetRestSeconds: 120,
    restSeconds: 45,
  };
  value.rest = { endsAt: 1792422090000, totalSeconds: 120 };
  saveDraft(store, value);
  expect(loadDraft(store, value.userId, value.plannedSessionId)).toEqual(value);
});

it("recupera esfuerzo y nota sin exigirlos a borradores antiguos (T156)", () => {
  const store = fakeStorage();
  const value = draft({ perceivedEffort: 7, note: "Última serie exigente" });
  saveDraft(store, value);
  expect(loadDraft(store, "user-a", "session-1")).toEqual(value);
  saveDraft(store, draft());
  expect(loadDraft(store, "user-a", "session-1")).toEqual(draft());
});

it("migra v1 al sobre v3 solo tras confirmar la copia completa (T162)", () => {
  const value = draft({
    note: "Conservar nota",
    perceivedEffort: 8,
    rest: { endsAt: 1792422090000, totalSeconds: 90 },
  });
  const storage = fakeStorage({
    [legacyDraftKey("user-a", "session-1")]: JSON.stringify({ ...value, version: 1 }),
  });
  expect(loadDraft(storage, "user-a", "session-1")).toEqual(value);
  expect(JSON.parse(storage.getItem(draftKey("user-a", "session-1"))!)).toEqual({
    version: 3,
    draft: value,
  });
  expect(storage.getItem(legacyDraftKey("user-a", "session-1"))).toBeNull();
});
it("si no cabe la migración conserva y recupera v1 sin afirmar un guardado nuevo (T162)", () => {
  const storage = fakeStorage({
    [legacyDraftKey("user-a", "session-1")]: JSON.stringify({ ...draft(), version: 1 }),
  });
  storage.setItem = () => {
    throw new DOMException("Full", "QuotaExceededError");
  };
  expect(loadDraft(storage, "user-a", "session-1")).toEqual(draft());
  expect(storage.getItem(legacyDraftKey("user-a", "session-1"))).not.toBeNull();
  expect(saveDraft(storage, draft({ note: "nueva" }))).toBe(false);
});
it("no sobrescribe ni elimina un sobre de versión desconocida (T162)", () => {
  const raw = JSON.stringify({ version: 99, draft: draft() });
  const storage = fakeStorage({ [draftKey("user-a", "session-1")]: raw });
  expect(loadDraft(storage, "user-a", "session-1")).toBeNull();
  expect(saveDraft(storage, draft())).toBe(false);
  expect(storage.getItem(draftKey("user-a", "session-1"))).toBe(raw);
});
it("conserva un borrador distinto de una pestaña anterior al confirmar el actual (T162)", () => {
  const old = draft({ workoutId: "11111111-1111-4111-8111-111111111112" });
  const storage = fakeStorage({
    [legacyDraftKey("user-a", "session-1")]: JSON.stringify({ ...old, version: 1 }),
  });
  saveDraft(storage, draft());
  expect(listDrafts(storage, "user-a")).toHaveLength(2);
  clearDraft(storage, "user-a", "session-1", draft().workoutId);
  expect(loadDraft(storage, "user-a", "session-1")?.workoutId).toBe(old.workoutId);
});

it("una copia v3 confirmada sigue guardada aunque no se pueda limpiar v1 (T162)", () => {
  const storage = fakeStorage({
    [legacyDraftKey("user-a", "session-1")]: JSON.stringify({ ...draft(), version: 1 }),
  });
  storage.removeItem = () => {
    throw new Error("blocked");
  };
  expect(saveDraft(storage, draft())).toBe(true);
  expect(storage.getItem(legacyDraftKey("user-a", "session-1"))).not.toBeNull();
  expect(JSON.parse(storage.getItem(draftKey("user-a", "session-1"))!).draft).toEqual(draft());
});
