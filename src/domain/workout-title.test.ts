import { expect, it } from "vitest";
import { workoutTitle, workoutOriginLabel } from "./workout-title";
it("muestra nombre y origen explícitos sin deducir libre de una FK/etiqueta ausente", () => {
  expect(workoutTitle({ sourceKind: "free", title: "Mi sesión", sessionLabel: null })).toBe(
    "Mi sesión",
  );
  expect(workoutTitle({ sourceKind: "personal", title: null, sessionLabel: null })).toBe(
    "Rutina personal",
  );
  expect(workoutTitle({ sourceKind: "assigned", sessionLabel: "A" })).toBe("Sesión A");
  expect(workoutTitle({ sessionLabel: null, title: "No inferir" })).toBe("Entrenamiento");
  expect(workoutOriginLabel("free")).toBe("Entrenamiento libre");
  expect(workoutOriginLabel("personal")).toBe("Rutina personal");
  expect(workoutOriginLabel(undefined)).toBe("Programa del coach");
});
