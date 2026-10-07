import { describe, expect, it } from "vitest";
import { EDIT_WINDOW_DAYS, isWorkoutEditable } from "./edit-window";

describe("ventana de edición de entrenamientos (RF-26b)", () => {
  it("dura 7 días", () => expect(EDIT_WINDOW_DAYS).toBe(7));

  it("el mismo día y hasta 7 días después se puede editar", () => {
    expect(isWorkoutEditable("2026-10-07", "2026-10-07")).toBe(true);
    expect(isWorkoutEditable("2026-10-01", "2026-10-07")).toBe(true);
    expect(isWorkoutEditable("2026-10-01", "2026-10-08")).toBe(true); // día 7: último día
  });

  it("al octavo día ya no", () => {
    expect(isWorkoutEditable("2026-10-01", "2026-10-09")).toBe(false);
    expect(isWorkoutEditable("2026-09-01", "2026-10-07")).toBe(false);
  });

  it("cruza meses y años correctamente", () => {
    expect(isWorkoutEditable("2026-12-28", "2027-01-04")).toBe(true);
    expect(isWorkoutEditable("2026-12-28", "2027-01-05")).toBe(false);
  });
});
