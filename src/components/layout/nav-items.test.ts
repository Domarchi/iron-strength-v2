import { describe, expect, it } from "vitest";
import { isActive, isFocusRoute, navItemsFor, withUnreadBadge } from "./nav-items";

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

describe("modo enfoque (RF-52)", () => {
  it("la sesión de entrenamiento oculta la navegación global", () => {
    expect(isFocusRoute("/workout/abc-123")).toBe(true);
  });

  it("el resto de las pantallas la muestran", () => {
    for (const path of [
      "/week",
      "/history/abc",
      "/progress",
      "/body",
      "/coach/students",
      "/workouts",
    ]) {
      expect(isFocusRoute(path)).toBe(false);
    }
  });
});

describe("contador de no leídos en la navegación (RF-37)", () => {
  it("el alumno lo ve en Historial", () => {
    const items = withUnreadBadge(navItemsFor("student"), "student", 3);
    expect(items.find((i) => i.href === "/history")?.badge).toBe(3);
    expect(items.filter((i) => i.badge).length).toBe(1);
  });

  it("el coach lo ve en Alumnos", () => {
    const items = withUnreadBadge(navItemsFor("coach"), "coach", 2);
    expect(items.find((i) => i.href === "/coach/students")?.badge).toBe(2);
    expect(items.filter((i) => i.badge).length).toBe(1);
  });

  it("sin comentarios sin leer no hay contador", () => {
    expect(withUnreadBadge(navItemsFor("student"), "student", 0).every((i) => !i.badge)).toBe(true);
  });
});
