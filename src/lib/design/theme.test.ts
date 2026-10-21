import { expect, it } from "vitest";
import { normalizeThemePreference, persistThemePreference, THEME_KEY } from "./theme";
it("solo admite claro, oscuro y sistema; datos desconocidos usan el sistema", () => {
  expect([null, "unknown", "light", "dark", "system"].map(normalizeThemePreference)).toEqual([
    "system",
    "system",
    "light",
    "dark",
    "system",
  ]);
});
it("comprueba la escritura y comunica cuota o almacenamiento bloqueado sin arrojar", () => {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  expect(persistThemePreference(store, "dark")).toBe(true);
  expect(store.getItem(THEME_KEY)).toBe("dark");
  expect(
    persistThemePreference(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      },
      "light",
    ),
  ).toBe(false);
  expect(persistThemePreference({ getItem: () => "system", setItem: () => {} }, "dark")).toBe(
    false,
  );
});
