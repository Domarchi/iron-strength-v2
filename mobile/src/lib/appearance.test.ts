import { describe, expect, it } from "vitest";
import {
  palettes,
  readAppearance,
  saveAppearance,
  resolveAppearance,
  APPEARANCE_KEY,
} from "./appearance";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    get: async () => value,
    set: async (_key: string, next: string) => {
      value = next;
    },
  };
}
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const c = hex
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe("apariencia del dispositivo", () => {
  it("inicia en sistema y sigue el dispositivo solo en ese modo", async () => {
    expect(await readAppearance(storage())).toBe("system");
    expect(resolveAppearance("system", "dark")).toBe("dark");
    expect(resolveAppearance("system", null)).toBe("light");
    expect(resolveAppearance("light", "dark")).toBe("light");
    expect(resolveAppearance("dark", "light")).toBe("dark");
  });
  it("conserva la selección versionada al abrir otra vez", async () => {
    const local = storage();
    await saveAppearance(local, "dark");
    expect(await readAppearance(local)).toBe("dark");
    expect(JSON.parse((await local.get())!)).toEqual({ version: 1, preference: "dark" });
    expect(APPEARANCE_KEY).not.toContain("training");
  });
  it("no elimina formatos desconocidos; una elección explícita los reemplaza", async () => {
    const unknown = '{"version":8,"preference":"future"}',
      local = storage(unknown);
    await expect(readAppearance(local)).rejects.toThrow();
    expect(await local.get()).toBe(unknown);
    await saveAppearance(local, "light");
    expect(await readAppearance(local)).toBe("light");
  });
  it("no afirma guardado con falta de espacio o relectura diferente", async () => {
    await expect(
      saveAppearance(
        {
          get: async () => null,
          set: async () => {
            throw new Error("quota");
          },
        },
        "dark",
      ),
    ).rejects.toThrow();
    await expect(
      saveAppearance({ get: async () => null, set: async () => {} }, "dark"),
    ).rejects.toThrow();
  });
  it.each(["light", "dark"] as const)(
    "mantiene contraste AA en textos y controles de %s",
    (mode) => {
      const p = palettes[mode];
      for (const bg of [p.bg, p.card, p.raised, p.tint, p.field, p.completed])
        for (const fg of [p.ink, p.muted, p.blue, p.success, p.danger])
          expect(contrast(fg, bg), `${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const bg of [p.bg, p.card, p.raised, p.tint, p.field, p.completed])
        expect(contrast(p.control, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast("#ffffff", p.button)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.dark ? p.bg : "#ffffff", p.completedMark)).toBeGreaterThanOrEqual(3);
    },
  );
});
