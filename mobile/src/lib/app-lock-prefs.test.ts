import { describe, expect, it } from "vitest";
import {
  LOCK_GRACE_MS,
  parseAppLock,
  readAppLock,
  saveAppLock,
  shouldLock,
} from "./app-lock-prefs";

const mem = (initial: string | null = null) => {
  let v = initial;
  return {
    get: async () => v,
    set: async (_k: string, value: string) => void (v = value),
    peek: () => v,
  };
};

describe("bloqueo de la app", () => {
  it("parte apagado, guarda y relee", async () => {
    const s = mem();
    expect(await readAppLock(s)).toBe(false);
    await saveAppLock(s, true);
    expect(await readAppLock(s)).toBe(true);
  });
  it("rechaza formatos desconocidos sin reemplazarlos", async () => {
    for (const raw of ["{}", '{"version":2,"enabled":true}', '{"version":1,"enabled":"si"}'])
      expect(() => parseAppLock(raw)).toThrow("desconocido");
    const s = mem('{"version":3}');
    await expect(readAppLock(s)).rejects.toThrow();
    expect(s.peek()).toBe('{"version":3}');
    await expect(saveAppLock({ get: async () => null, set: async () => {} }, true)).rejects.toThrow(
      "No se confirmó",
    );
  });
  it("bloquea solo tras superar el tiempo de gracia y si está activo", () => {
    const base = { enabled: true, backgroundedAtMs: 1000 };
    expect(shouldLock({ ...base, nowMs: 1000 + LOCK_GRACE_MS - 1 })).toBe(false);
    expect(shouldLock({ ...base, nowMs: 1000 + LOCK_GRACE_MS })).toBe(true);
    expect(shouldLock({ ...base, enabled: false, nowMs: 10_000_000 })).toBe(false);
    expect(shouldLock({ enabled: true, backgroundedAtMs: null, nowMs: 10_000_000 })).toBe(false);
    expect(shouldLock({ ...base, nowMs: 1500, graceMs: 100 })).toBe(true);
  });
});
