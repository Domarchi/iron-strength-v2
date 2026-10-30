import { expect, it } from "vitest";
import {
  TrainingPreferencesController,
  defaultTrainingPreferences,
  trainingPreferencesKey,
} from "./training-preferences";
import { AtomicStoreError, type AtomicStorage } from "./atomic-contract";
const id = "00000000-0000-4000-8000-000000000001";
function setup() {
  const values = new Map<string, string>();
  let full = false,
    lost = false;
  const storage: AtomicStorage = {
    get: async (k) => {
      if (lost) {
        lost = false;
        throw Error("read");
      }
      return values.get(k) ?? null;
    },
    set: async (k, v) => {
      values.set(k, v);
    },
    remove: async (k) => {
      values.delete(k);
    },
    compareAndSet: async (k, before, next) => {
      if (full) throw Error("quota");
      if ((values.get(k) ?? null) !== before) throw new AtomicStoreError("conflict");
      values.set(k, next);
    },
  };
  return {
    values,
    storage,
    setFull: (v: boolean) => {
      full = v;
    },
    loseRead: () => {
      lost = true;
    },
  };
}
it("preferencias explícitas por cuenta, cancelar no escribe y recarga conserva", async () => {
  const x = setup(),
    c = new TrainingPreferencesController(id, x.storage);
  await c.restore();
  expect(c.getSnapshot().value).toEqual(defaultTrainingPreferences());
  expect(x.values.size).toBe(0);
  const v = { ...defaultTrainingPreferences(), weightUnit: "lb" as const, restSeconds: 0 };
  await c.save(v);
  const other = new TrainingPreferencesController(
    "00000000-0000-4000-8000-000000000002",
    x.storage,
  );
  await other.restore();
  expect(other.getSnapshot().value.weightUnit).toBe("kg");
  const again = new TrainingPreferencesController(id, x.storage);
  await again.restore();
  expect(again.getSnapshot().value).toEqual(v);
});
it("cuota conserva preferencias confirmadas y permite reintento exacto", async () => {
  const x = setup(),
    c = new TrainingPreferencesController(id, x.storage);
  await c.restore();
  x.setFull(true);
  const v = { ...defaultTrainingPreferences(), distanceUnit: "mi" as const };
  await expect(c.save(v)).rejects.toThrow();
  expect(c.getSnapshot().value.distanceUnit).toBe("m");
  x.setFull(false);
  await c.save(v);
  expect(c.getSnapshot().value.distanceUnit).toBe("mi");
});
it("dos ventanas no sobrescriben y releer conserva la versión remota", async () => {
  const x = setup(),
    c = new TrainingPreferencesController(id, x.storage),
    d = new TrainingPreferencesController(id, x.storage);
  await c.restore();
  await d.restore();
  await c.save({ ...defaultTrainingPreferences(), weightUnit: "lb" });
  const raw = x.values.get(trainingPreferencesKey(id));
  await expect(d.save({ ...defaultTrainingPreferences(), restSeconds: 60 })).rejects.toThrow();
  expect(x.values.get(trainingPreferencesKey(id))).toBe(raw);
  await d.restore();
  expect(d.getSnapshot().value.weightUnit).toBe("lb");
});
it("formatos desconocidos y JSON roto quedan intactos, sin escritura", async () => {
  for (const raw of ['{"version":99}', "{"]) {
    const x = setup();
    x.values.set(trainingPreferencesKey(id), raw);
    const c = new TrainingPreferencesController(id, x.storage);
    await c.restore();
    expect(c.getSnapshot().blocked).toBe(true);
    await expect(c.save(defaultTrainingPreferences())).rejects.toThrow();
    expect(x.values.get(trainingPreferencesKey(id))).toBe(raw);
  }
});
it("valida descanso y equipo sin truncar ni aceptar campos futuros", async () => {
  const x = setup(),
    c = new TrainingPreferencesController(id, x.storage);
  await c.restore();
  for (const restSeconds of [-1, 1, 601, 20, Infinity])
    await expect(c.save({ ...defaultTrainingPreferences(), restSeconds })).rejects.toThrow();
  for (const restSeconds of [0, 15, 600])
    await c.save({ ...defaultTrainingPreferences(), restSeconds });
  await expect(
    c.save({
      ...defaultTrainingPreferences(),
      equipment: { unit: "kg", bar: 20, plates: [{ weight: 20, pairs: 21 }] },
    }),
  ).rejects.toThrow();
});
it("respuesta de almacenamiento perdida se reconcilia sin otra escritura ni sobreescribir", async () => {
  const x = setup(),
    c = new TrainingPreferencesController(id, x.storage);
  await c.restore();
  const value = { ...defaultTrainingPreferences(), restSeconds: 120 };
  const cas = x.storage.compareAndSet;
  x.storage.compareAndSet = async (...args) => {
    await cas(...args);
    x.loseRead();
  };
  await expect(c.save(value)).rejects.toThrow();
  x.storage.compareAndSet = async () => {
    throw Error("no segunda escritura");
  };
  await c.save(value);
  expect(c.getSnapshot().value.restSeconds).toBe(120);
});

it("no inicia con un valor provisional mientras se leen o guardan preferencias", async () => {
  const x = setup(),
    c = new TrainingPreferencesController(id, x.storage);
  expect(() => c.restForNewSession()).toThrow();
  await c.restore();
  expect(c.restForNewSession()).toBe(90);
  const saving = c.save({ ...defaultTrainingPreferences(), restSeconds: 0 });
  expect(() => c.restForNewSession()).toThrow();
  await saving;
  expect(c.restForNewSession()).toBe(0);
});

it.each(['{"version":99}', "{"])(
  "no inicia con un descanso supuesto si las preferencias no se pueden interpretar: %s",
  async (raw) => {
    const x = setup();
    x.values.set(trainingPreferencesKey(id), raw);
    const c = new TrainingPreferencesController(id, x.storage);
    await c.restore();
    expect(() => c.restForNewSession()).toThrow(/Cuenta.*Releer preferencias/);
    expect(x.values.get(trainingPreferencesKey(id))).toBe(raw);
  },
);

it("relee un descanso confirmado después de fallar la lectura sin iniciar con90segundos", async () => {
  const x = setup(),
    previous = new TrainingPreferencesController(id, x.storage);
  await previous.restore();
  await previous.save({ ...defaultTrainingPreferences(), restSeconds: 120 });
  const raw = x.values.get(trainingPreferencesKey(id));
  const c = new TrainingPreferencesController(id, x.storage);
  x.loseRead();
  await c.restore();
  expect(() => c.restForNewSession()).toThrow(/Cuenta.*Releer preferencias/);
  expect(x.values.get(trainingPreferencesKey(id))).toBe(raw);
  await c.restore();
  expect(c.restForNewSession()).toBe(120);
  expect(x.values.get(trainingPreferencesKey(id))).toBe(raw);
});

it("coordina escrituras con eliminación de cuenta: no repone preferencias después de limpiar", async () => {
  const x = setup(),
    c = new TrainingPreferencesController(id, x.storage);
  await c.restore();
  const saving = c.save({ ...defaultTrainingPreferences(), restSeconds: 120 });
  expect(() => c.pauseWrites()).toThrow();
  await saving;
  const release = c.pauseWrites();
  await x.storage.remove(trainingPreferencesKey(id));
  await expect(c.save(defaultTrainingPreferences())).rejects.toThrow();
  expect(x.values.has(trainingPreferencesKey(id))).toBe(false);
  expect(c.getSnapshot().paused).toBe(true);
  release();
  release();
  expect(c.getSnapshot().paused).toBe(false);
});
