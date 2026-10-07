import { describe, expect, it } from "vitest";
import { isActive, navItemsFor } from "./nav-items";

describe("navegación por rol", () => {
  it("el alumno ve su semana, historial, progreso y cuerpo", () => {
    expect(navItemsFor("student").map((i) => i.href)).toEqual([
      "/week",
      "/history",
      "/progress",
      "/body",
    ]);
  });

  it("el coach ve la gestión y 'Mi entrenamiento', y ningún enlace del alumno salvo /week", () => {
    const hrefs = navItemsFor("coach").map((i) => i.href);
    expect(hrefs).toEqual(["/coach/students", "/coach/programs", "/coach/exercises", "/week"]);
  });

  it("marca activa la ruta propia y sus hijas, sin confundir prefijos parecidos", () => {
    expect(isActive("/coach/programs", "/coach/programs")).toBe(true);
    expect(isActive("/coach/programs/abc/edit", "/coach/programs")).toBe(true);
    expect(isActive("/coach/programs-viejos", "/coach/programs")).toBe(false);
    expect(isActive("/week", "/history")).toBe(false);
  });
});
