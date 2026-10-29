import { expect, it, vi } from "vitest";
import { bundleSchema } from "./training-bundle";
import { DownloadController, downloadKey, downloadRecordSchema } from "./download-controller";
const owner = "ad219000-0000-4000-8000-000000000001";
const other = "ad219000-0000-4000-8000-000000000002";
const bundle = (at = "2026-10-29T12:00:00Z") =>
  bundleSchema.parse({
    version: 1,
    userId: owner,
    downloadedAt: at,
    catalog: { version: 2, exercises: [] },
    library: { version: 2, userId: owner, folders: [], routines: [] },
    week: null,
    history: {},
  });
function setup() {
  const values = new Map<string, string>();
  let currentOwner = owner,
    mode = "";
  const get = vi.fn(async (k: string) => {
    if (mode === "read") throw Error("private path");
    return values.get(k) ?? null;
  });
  const compareAndSet = vi.fn(async (k: string, before: string | null, next: string) => {
    if (mode === "quota")
      throw Object.assign(Error("private path"), { name: "QuotaExceededError" });
    if ((values.get(k) ?? null) !== before)
      throw Object.assign(Error("private path"), { code: "conflict" });
    values.set(k, next);
    if (mode === "after") mode = "read";
  });
  const fetch = vi.fn(async () => bundle());
  const make = () =>
    new DownloadController(owner, { get, compareAndSet }, fetch, () => currentOwner === owner);
  return {
    values,
    get,
    compareAndSet,
    fetch,
    make,
    setOwner: (v: string) => {
      currentOwner = v;
    },
    setMode: (v: string) => {
      mode = v;
    },
  };
}
it("primera descarga solo se anuncia tras validar/escribir/releer y lectura no reescribe bytes", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  expect(c.getSnapshot().verified).toBe(true);
  expect(c.getSnapshot().bundle).toBeNull();
  expect(await c.download()).toBe(true);
  const raw = x.values.get(downloadKey(owner))!;
  expect(downloadRecordSchema.parse(JSON.parse(raw))).toMatchObject({
    version: 1,
    userId: owner,
    bundle: bundle(),
    previousBundle: null,
  });
  const c2 = x.make();
  await c2.restore();
  expect(c2.getSnapshot().bundle).toEqual(bundle());
  expect(x.values.get(downloadKey(owner))).toBe(raw);
  expect(x.compareAndSet).toHaveBeenCalledTimes(1);
});
it("actualizar retiene una sola copia anterior, sin encadenar todos los formatos", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  await c.download();
  x.fetch.mockResolvedValue(bundle("2026-10-29T13:00:00Z"));
  await c.download();
  x.fetch.mockResolvedValue(bundle("2026-10-29T14:00:00Z"));
  await c.download();
  const record = downloadRecordSchema.parse(JSON.parse(x.values.get(c.key)!));
  expect(record.bundle!.downloadedAt).toBe("2026-10-29T14:00:00Z");
  expect(record.previousBundle!.downloadedAt).toBe("2026-10-29T13:00:00Z");
  expect(x.values.get(c.key)).not.toContain("2026-10-29T12:00:00Z");
});
it("cuota conserva bytes y la descarga anterior se comprueba sin perderla", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  await c.download();
  const raw = x.values.get(c.key);
  x.setMode("quota");
  x.fetch.mockResolvedValue(bundle("2026-10-29T13:00:00Z"));
  expect(await c.download()).toBe(false);
  expect(x.values.get(c.key)).toBe(raw);
  expect(c.getSnapshot().verified).toBe(false);
  x.setMode("");
  await c.restore();
  expect(c.getSnapshot().bundle).toEqual(bundle());
  expect(c.getSnapshot().verified).toBe(true);
});
it("fallar al releer no pierde la copia anterior ni acredita disponibilidad nueva", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  await c.download();
  x.fetch.mockResolvedValue(bundle("2026-10-29T13:00:00Z"));
  x.setMode("after");
  expect(await c.download()).toBe(false);
  expect(c.getSnapshot().verified).toBe(false);
  const disk = downloadRecordSchema.parse(JSON.parse(x.values.get(c.key)!));
  expect(disk.previousBundle).toEqual(bundle());
  x.setMode("");
  await c.restore();
  expect(c.getSnapshot().bundle).toEqual(bundle("2026-10-29T13:00:00Z"));
  expect(c.getSnapshot().verified).toBe(true);
});
it("dos controladores no sobrescriben una copia que cambió después de leer", async () => {
  const x = setup(),
    a = x.make(),
    b = x.make();
  await a.restore();
  await b.restore();
  await a.download();
  const raw = x.values.get(a.key);
  x.fetch.mockResolvedValue(bundle("2026-10-29T13:00:00Z"));
  expect(await b.download()).toBe(false);
  expect(b.getSnapshot().error?.code).toBe("conflict");
  expect(x.values.get(a.key)).toBe(raw);
  await b.restore();
  expect(await b.download()).toBe(true);
});
it("formatos desconocidos o de otra cuenta se conservan y bloquean sin fallback", async () => {
  for (const raw of [
    '{"version":99}',
    JSON.stringify({ version: 1, userId: other, bundle: null, previousBundle: null }),
  ]) {
    const x = setup(),
      c = x.make();
    x.values.set(c.key, raw);
    await c.restore();
    expect(c.getSnapshot()).toMatchObject({ blocked: true, verified: false, bundle: null });
    expect(await c.download()).toBe(false);
    expect(x.fetch).not.toHaveBeenCalled();
    expect(x.values.get(c.key)).toBe(raw);
  }
});
it("respuesta futura/ajena/error de red no reemplaza una copia completa conocida", async () => {
  for (const bad of [
    { ...bundle(), version: 99 },
    { ...bundle(), userId: other },
    Error("private credential"),
  ]) {
    const x = setup(),
      c = x.make();
    await c.restore();
    await c.download();
    const raw = x.values.get(c.key);
    if (bad instanceof Error) x.fetch.mockRejectedValue(bad);
    else x.fetch.mockResolvedValue(bad as never);
    expect(await c.download()).toBe(false);
    expect(x.values.get(c.key)).toBe(raw);
    expect(c.getSnapshot().bundle).toEqual(bundle());
    expect(c.getSnapshot().error?.message).not.toContain("private");
  }
});
it("cambiar cuenta durante la consulta no escribe y oculta datos de la identidad anterior", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  let release!: (v: unknown) => void;
  x.fetch.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }) as never,
  );
  const op = c.download();
  x.setOwner(other);
  release(bundle());
  expect(await op).toBe(false);
  expect(x.compareAndSet).not.toHaveBeenCalled();
  expect(c.getSnapshot().bundle).toBeNull();
});
it("una respuesta más antigua no desplaza la última copia", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  x.fetch.mockResolvedValue(bundle("2026-10-29T14:00:00Z"));
  await c.download();
  const raw = x.values.get(c.key);
  x.fetch.mockResolvedValue(bundle());
  expect(await c.download()).toBe(false);
  expect(c.getSnapshot().error?.code).toBe("stale");
  expect(x.values.get(c.key)).toBe(raw);
});
it("una descarga idéntica verifica CAS sin descartar la copia anterior", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  await c.download();
  x.fetch.mockResolvedValue(bundle("2026-10-29T13:00:00Z"));
  await c.download();
  const raw = x.values.get(c.key);
  expect(await c.download()).toBe(true);
  expect(x.values.get(c.key)).toBe(raw);
});
it("el borrado explícito es solo de esta copia y su respaldo, no de otros datos", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  await c.download();
  x.values.set(downloadKey(other), "other");
  x.values.set(`is:native-training:v1:${owner}`, "active frozen");
  expect(await c.remove()).toBe(true);
  expect(JSON.parse(x.values.get(c.key)!)).toEqual({
    version: 1,
    userId: owner,
    bundle: null,
    previousBundle: null,
  });
  expect(x.values.get(downloadKey(other))).toBe("other");
  expect(x.values.get(`is:native-training:v1:${owner}`)).toBe("active frozen");
});
it("la reserva de salida impide nuevos intentos y espera el intento en curso", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  let release!: (v: unknown) => void;
  x.fetch.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }) as never,
  );
  const op = c.download();
  let reserved = false;
  const reservation = c.reserve().then((r) => {
    reserved = true;
    return r;
  });
  expect(c.getSnapshot().reserved).toBe(true);
  expect(await c.download()).toBe(false);
  expect(reserved).toBe(false);
  release(bundle());
  await op;
  const unreserve = await reservation;
  expect(reserved).toBe(true);
  unreserve();
  unreserve();
  expect(c.getSnapshot().reserved).toBe(false);
});
it("desmontar durante una consulta no escribe y el mismo controlador se puede recuperar", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  let release!: (v: unknown) => void;
  x.fetch.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }) as never,
  );
  const op = c.download();
  c.dispose();
  release(bundle());
  expect(await op).toBe(false);
  expect(x.values.has(c.key)).toBe(false);
  await c.restore();
  expect(c.getSnapshot().ready).toBe(true);
});
it("quitar una copia después de cambiar cuenta no expone ni borra la anterior", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  await c.download();
  const raw = x.values.get(c.key);
  x.setOwner(other);
  expect(await c.remove()).toBe(false);
  expect(x.values.get(c.key)).toBe(raw);
  expect(c.getSnapshot().bundle).toBeNull();
});
it("reserva y descarga no aceptan blobs cuya copia anterior pertenece a otro usuario", async () => {
  const x = setup(),
    c = x.make();
  x.values.set(
    c.key,
    JSON.stringify({
      version: 1,
      userId: owner,
      bundle: bundle(),
      previousBundle: {
        ...bundle(),
        userId: other,
        library: { ...bundle().library, userId: other },
      },
    }),
  );
  await c.restore();
  expect(c.getSnapshot().blocked).toBe(true);
  expect(c.getSnapshot().bundle).toBeNull();
  expect(x.compareAndSet).not.toHaveBeenCalled();
});
it("descargas consecutivas conservan el orden de microsegundos de SQL", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  x.fetch.mockResolvedValue(bundle("2026-10-29T14:00:00.000100Z"));
  expect(await c.download()).toBe(true);
  x.fetch.mockResolvedValue(bundle("2026-10-29T14:00:00.000900Z"));
  expect(await c.download()).toBe(true);
  expect(c.getSnapshot().bundle!.downloadedAt).toBe("2026-10-29T14:00:00.000900Z");
});
it("respuesta incompatible del cliente explica formato y conserva la copia verificada", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  await c.download();
  const raw = x.values.get(c.key);
  x.fetch.mockRejectedValue(Object.assign(Error("version"), { code: "version" }));
  expect(await c.download()).toBe(false);
  expect(c.getSnapshot().error?.code).toBe("format");
  expect(c.getSnapshot().verified).toBe(true);
  expect(x.values.get(c.key)).toBe(raw);
});
it("reconoce cuota de SQLite por el error del SDK sin mostrar su mensaje interno", async () => {
  const x = setup(),
    c = x.make();
  await c.restore();
  await c.download();
  const raw = x.values.get(c.key);
  x.fetch.mockResolvedValue(bundle("2026-10-29T13:00:00Z"));
  x.compareAndSet.mockRejectedValue(
    Object.assign(Error("database or disk is full: private device path"), {
      code: "ERR_SQLITE_ERROR",
    }),
  );
  expect(await c.download()).toBe(false);
  expect(c.getSnapshot().error?.code).toBe("quota");
  expect(c.getSnapshot().error?.message).not.toContain("private device");
  expect(x.values.get(c.key)).toBe(raw);
});
