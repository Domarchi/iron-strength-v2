import { describe, expect, it } from "vitest";
import { defaultIncrementFor, EQUIPMENT } from "./exercise-options";

describe("incremento de progresión por equipamiento (RF-15b)", () => {
  it("2,5 kg con barra y sus variantes, 2 kg con mancuernas y máquinas, 1 kg en banda y peso corporal", () => {
    expect(defaultIncrementFor("Barra")).toBe(2.5);
    expect(defaultIncrementFor("Trap bar")).toBe(2.5);
    expect(defaultIncrementFor("Máquina Smith")).toBe(2.5);
    expect(defaultIncrementFor("Mancuernas")).toBe(2);
    expect(defaultIncrementFor("Máquina")).toBe(2);
    expect(defaultIncrementFor("Polea")).toBe(2);
    expect(defaultIncrementFor("Banda elástica")).toBe(1);
    expect(defaultIncrementFor("Peso corporal")).toBe(1);
  });

  it("un equipamiento desconocido o vacío usa 2,5 kg", () => {
    expect(defaultIncrementFor("Cosa rara")).toBe(2.5);
    expect(defaultIncrementFor(null)).toBe(2.5);
  });

  it("lista los equipamientos del catálogo", () => {
    expect(EQUIPMENT).toContain("Barra");
    expect(EQUIPMENT).toContain("Peso corporal");
    expect(new Set(EQUIPMENT).size).toBe(EQUIPMENT.length);
  });
});
