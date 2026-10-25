import { describe, expect, it } from "vitest";
import { parseNativeWeek } from "./download-contract";
import { downloadId, weekDownloadFixture } from "../../test/fixtures/week-download";
describe("paquete móvil completo y privado por cuenta", () => {
  it("conserva series, alternativas, grupos e historial, sin extras sensibles", () => {
    const pack = weekDownloadFixture(),
      value = { version: 1, userId: pack.userId, pack: { ...pack, accessToken: "never store" } };
    expect(parseNativeWeek(value, pack.userId)).toEqual({ version: 1, userId: pack.userId, pack });
    expect(parseNativeWeek({ ...value, userId: downloadId(99) }, pack.userId)).toBeNull();
    expect(
      parseNativeWeek({ ...value, pack: { ...pack, userId: downloadId(99) } }, pack.userId),
    ).toBeNull();
  });
  it("rechaza formatos futuros y descargas incompletas; admite sobre vacío conocido", () => {
    const pack = weekDownloadFixture(),
      value = { version: 1, userId: pack.userId, pack };
    expect(parseNativeWeek({ ...value, version: 2 }, pack.userId)).toBeNull();
    const invalid = structuredClone(pack);
    delete invalid.history[downloadId(6)];
    expect(parseNativeWeek({ ...value, pack: invalid }, pack.userId)).toBeNull();
    expect(parseNativeWeek({ ...value, pack: null }, pack.userId)).toEqual({
      ...value,
      pack: null,
    });
    expect(parseNativeWeek({ version: 1, userId: pack.userId }, pack.userId)).toBeNull();
  });
});
