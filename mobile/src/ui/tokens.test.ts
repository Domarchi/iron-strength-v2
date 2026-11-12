import { describe, expect, it } from "vitest";
import { contrast, themes, typeScale, touch } from "./tokens";

const pairs: [keyof (typeof themes)["dark"], keyof (typeof themes)["dark"], number][] = [
  ["text", "bg", 7],
  ["text", "surface", 7],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "surface2", 4.5],
  ["accent", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["accent", "accentSoft", 4.5],
  ["onAccent", "accent", 4.5],
  ["ok", "okBg", 4.5],
  ["rec", "recBg", 4.5],
  ["danger", "bg", 4.5],
  ["danger", "surface", 4.5],
  ["danger", "dangerBg", 4.5],
];

describe("tokens Forja", () => {
  for (const name of ["dark", "light"] as const)
    for (const [fg, bg, min] of pairs)
      it(`${name}: ${fg} sobre ${bg} cumple ${min}:1`, () => {
        expect(
          contrast(themes[name][fg] as string, themes[name][bg] as string),
        ).toBeGreaterThanOrEqual(min);
      });
  it("claro y oscuro definen las mismas claves", () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort());
  });
  it("la escala tipográfica tiene seis niveles y cifras con tamaño legible", () => {
    expect(Object.keys(typeScale)).toHaveLength(7);
    for (const v of Object.values(typeScale)) expect(v.line).toBeGreaterThanOrEqual(v.size);
    expect(typeScale.body.size).toBeGreaterThanOrEqual(15);
  });
  it("el objetivo táctil mínimo es 44", () => {
    expect(touch).toBe(44);
  });
});
