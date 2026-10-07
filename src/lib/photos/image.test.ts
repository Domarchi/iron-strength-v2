import { describe, expect, it } from "vitest";
import { compressToLimit, fitWithin, isHeic, MAX_SIDE, PHOTO_LIMIT_BYTES } from "./image";

describe("fitWithin (lado mayor máximo)", () => {
  it("reduce manteniendo la proporción", () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it("no agranda las imágenes pequeñas", () => {
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it("usa enteros y nunca 0", () => {
    const { width, height } = fitWithin(10000, 1, 1280);
    expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("los límites coinciden con la spec (DC-18)", () => {
    expect(MAX_SIDE).toBe(1280);
    expect(PHOTO_LIMIT_BYTES).toBe(1_048_576);
  });
});

describe("isHeic", () => {
  const file = (name: string, type: string) => ({ name, type }) as File;

  it("detecta HEIC/HEIF por tipo o por extensión (iPhone no siempre informa el tipo)", () => {
    expect(isHeic(file("a.heic", "image/heic"))).toBe(true);
    expect(isHeic(file("a.HEIC", ""))).toBe(true);
    expect(isHeic(file("a.heif", "image/heif"))).toBe(true);
  });

  it("no confunde otros formatos", () => {
    expect(isHeic(file("a.jpg", "image/jpeg"))).toBe(false);
    expect(isHeic(file("a.webp", "image/webp"))).toBe(false);
  });
});

describe("compressToLimit (una imagen de 6 MB queda bajo 1 MB)", () => {
  // Codificador simulado: el tamaño crece con la calidad y con el área (escala²).
  const fakeEncoder = (baseBytes: number) => async (quality: number, scale: number) =>
    ({ size: Math.round(baseBytes * quality * scale * scale), type: "image/webp" }) as Blob;

  it("devuelve a la primera si ya cabe, con la mayor calidad", async () => {
    const result = await compressToLimit({
      encode: fakeEncoder(500_000),
      limit: PHOTO_LIMIT_BYTES,
    });
    expect(result.blob.size).toBeLessThanOrEqual(PHOTO_LIMIT_BYTES);
    expect(result.quality).toBe(0.85);
    expect(result.scale).toBe(1);
  });

  it("baja la calidad hasta que cabe", async () => {
    const result = await compressToLimit({
      encode: fakeEncoder(1_800_000),
      limit: PHOTO_LIMIT_BYTES,
    });
    expect(result.blob.size).toBeLessThanOrEqual(PHOTO_LIMIT_BYTES);
    expect(result.quality).toBeLessThan(0.85);
    expect(result.scale).toBe(1);
  });

  it("si la calidad no alcanza, reduce también el tamaño", async () => {
    const result = await compressToLimit({
      encode: fakeEncoder(6_000_000),
      limit: PHOTO_LIMIT_BYTES,
    });
    expect(result.blob.size).toBeLessThanOrEqual(PHOTO_LIMIT_BYTES);
    expect(result.scale).toBeLessThan(1);
  });

  it("falla con un error claro si no logra cumplir el límite", async () => {
    await expect(
      compressToLimit({ encode: fakeEncoder(1_000_000_000), limit: PHOTO_LIMIT_BYTES }),
    ).rejects.toThrow(/no se pudo reducir/i);
  });

  it("prueba las calidades en orden descendente y no repite trabajo", async () => {
    const calls: [number, number][] = [];
    await compressToLimit({
      encode: async (q, s) => {
        calls.push([q, s]);
        return { size: PHOTO_LIMIT_BYTES * 3, type: "image/webp" } as Blob;
      },
      limit: PHOTO_LIMIT_BYTES,
    }).catch(() => undefined);
    const firstScale = calls.filter(([, s]) => s === 1).map(([q]) => q);
    expect([...firstScale].sort((a, b) => b - a)).toEqual(firstScale);
    expect(new Set(calls.map((c) => c.join("-"))).size).toBe(calls.length);
  });
});
