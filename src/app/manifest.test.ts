import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifiesto de la app instalable (RF-45)", () => {
  const m = manifest();

  it("abre como aplicación independiente, vertical y en español de Chile", () => {
    expect(m.display).toBe("standalone");
    expect(m.orientation).toBe("portrait");
    expect(m.lang).toBe("es-CL");
    expect(m.start_url).toBe("/");
    expect(m.name).toBe("Iron Strength");
  });

  it("tiene iconos de 192 y 512 px y uno enmascarable", () => {
    const sizes = (m.icons ?? []).map((i) => `${i.sizes}:${i.purpose ?? "any"}`);
    expect(sizes).toContain("192x192:any");
    expect(sizes).toContain("512x512:any");
    expect(sizes).toContain("512x512:maskable");
    for (const icon of m.icons ?? []) expect(icon.type).toBe("image/png");
  });

  it("los colores coinciden con la nueva superficie clara de la app", () => {
    expect(m.background_color).toBe("#f6f7f4");
    expect(m.theme_color).toBe("#f6f7f4");
  });
});
