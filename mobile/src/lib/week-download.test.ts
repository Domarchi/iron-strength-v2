import { describe, expect, it, vi } from "vitest";
import {
  NativeWeekController,
  WeekStorageError,
  nativeWeekKey,
  type WeekStorage,
} from "./week-download";
import { downloadId, weekDownloadFixture } from "../../../src/test/fixtures/week-download";
const id = downloadId(1),
  expected = { programId: downloadId(2), weekStart: "2026-10-19" };
function setup() {
  const values = new Map<string, string>();
  const storage: WeekStorage = {
    get: vi.fn(async (k) => values.get(k) ?? null),
    set: vi.fn(async (k, v) => {
      values.set(k, v);
    }),
    remove: vi.fn(async (k) => {
      values.delete(k);
    }),
    compareAndSet: vi.fn(async (k, before, next) => {
      if ((values.get(k) ?? null) !== before) throw new WeekStorageError("conflict");
      values.set(k, next);
    }),
  };
  const fetch = vi.fn(async () => weekDownloadFixture());
  return { values, storage, fetch, controller: new NativeWeekController(id, storage, fetch) };
}
describe("descarga nativa completa y verificada", () => {
  it("guarda, relee y recupera todo; eliminar descarga conserva los entrenamientos", async () => {
    const x = setup();
    x.values.set("is:native-training:v1:" + id, "active");
    await x.controller.restore();
    await x.controller.download(expected);
    expect(x.controller.getSnapshot()).toMatchObject({
      verified: true,
      pack: weekDownloadFixture(),
      busy: false,
    });
    const reopened = new NativeWeekController(id, x.storage, x.fetch);
    await reopened.restore();
    expect(
      reopened.getSnapshot().pack?.sessions[0].context.exercises[0].prescribed.series,
    ).toHaveLength(2);
    await reopened.remove();
    expect(reopened.getSnapshot()).toMatchObject({ verified: true, pack: null });
    expect(JSON.parse(x.values.get(nativeWeekKey(id))!).pack).toBeNull();
    expect(x.values.get("is:native-training:v1:" + id)).toBe("active");
  });
  it("no sustituye semana/cuenta distintas ni respuesta más antigua", async () => {
    const x = setup();
    await x.controller.restore();
    await x.controller.download(expected);
    const before = x.values.get(nativeWeekKey(id));
    x.fetch.mockResolvedValueOnce(weekDownloadFixture(downloadId(99)));
    await expect(x.controller.download(expected)).rejects.toThrow();
    await expect(x.controller.download({ ...expected, weekStart: "2026-10-26" })).rejects.toThrow();
    x.fetch.mockResolvedValueOnce(weekDownloadFixture(id, "2026-10-23T12:00:00Z"));
    await expect(x.controller.download(expected)).rejects.toThrow();
    expect(x.values.get(nativeWeekKey(id))).toBe(before);
  });
  it("cuota o relectura fallida nunca afirman guardado; origen desconocido se conserva", async () => {
    const x = setup();
    await x.controller.restore();
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce({ name: "QuotaExceededError" });
    await expect(x.controller.download(expected)).rejects.toThrow("espacio");
    expect(x.controller.getSnapshot()).toMatchObject({ verified: false, blocked: true });
    expect(x.values.has(nativeWeekKey(id))).toBe(false);
    await x.controller.restore();
    vi.mocked(x.storage.get).mockRejectedValueOnce(Error("read"));
    await expect(x.controller.download(expected)).rejects.toThrow();
    expect(x.controller.getSnapshot().verified).toBe(false);
    await x.controller.restore();
    expect(x.controller.getSnapshot().verified).toBe(true);
    const future = '{"version":99,"userId":"' + id + '"}';
    x.values.set(nativeWeekKey(id), future);
    await x.controller.restore();
    expect(x.controller.getSnapshot().blocked).toBe(true);
    await expect(x.controller.download(expected)).rejects.toThrow();
    await expect(x.controller.remove()).rejects.toThrow();
    expect(x.values.get(nativeWeekKey(id))).toBe(future);
  });
  it("dos controladores no se pisan ni cambian datos de otra cuenta", async () => {
    const x = setup(),
      second = new NativeWeekController(id, x.storage, async () =>
        weekDownloadFixture(id, "2026-10-24T14:00:00Z"),
      );
    x.values.set(nativeWeekKey(downloadId(99)), "other");
    await x.controller.restore();
    await second.restore();
    await second.download(expected);
    await expect(x.controller.download(expected)).rejects.toThrow();
    expect(x.controller.getSnapshot()).toMatchObject({ verified: false, blocked: true });
    expect(JSON.parse(x.values.get(nativeWeekKey(id))!).pack.downloadedAt).toBe(
      "2026-10-24T14:00:00Z",
    );
    expect(x.values.get(nativeWeekKey(downloadId(99)))).toBe("other");
  });
  it("cambiar sesión mientras llega la red no guarda una respuesta tardía", async () => {
    const x = setup();
    let resolve!: (p: ReturnType<typeof weekDownloadFixture>) => void;
    x.fetch.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await x.controller.restore();
    const pending = x.controller.download(expected),
      check = expect(pending).rejects.toThrow();
    x.controller.dispose();
    resolve(weekDownloadFixture());
    await check;
    expect(x.values.has(nativeWeekKey(id))).toBe(false);
  });
  it("un adaptador sin bloqueo seguro no guarda y explica la incompatibilidad", async () => {
    const x = setup();
    await x.controller.restore();
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(new WeekStorageError("unsupported"));
    await expect(x.controller.download(expected)).rejects.toThrow("navegador");
    expect(x.values.has(nativeWeekKey(id))).toBe(false);
    expect(x.controller.getSnapshot()).toMatchObject({ verified: false, blocked: true });
  });
});
