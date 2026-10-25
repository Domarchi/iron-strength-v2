import { describe, expect, it } from "vitest";
import { chartCoordinates, progressReturn } from "./progress-view";
describe("progreso legible y retorno cerrado", () => {
  it("cero, uno y valores iguales producen coordenadas finitas", () => {
    expect(chartCoordinates([])).toEqual([]);
    expect(chartCoordinates([5])).toEqual([{ x: 150, y: 85 }]);
    const points = chartCoordinates([0, 0, 0]);
    expect(points.map((p) => p.x)).toEqual([12, 150, 288]);
    expect(points.every((p) => Number.isFinite(p.y))).toBe(true);
    expect(chartCoordinates([20, 80])[1].y).toBeLessThan(chartCoordinates([20, 80])[0].y);
  });
  it("solo conserva periodo/métrica y ejercicio realizado en la evidencia", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(progressReturn({ exercise: id, weeks: "12", metric: "volume" }, [id])).toEqual({
      exercise: id,
      weeks: 12,
      metric: "volume",
    });
    expect(progressReturn({ exercise: id, weeks: "12", metric: "volume" }, [])).toBeNull();
    for (const params of [
      { exercise: id, weeks: "9", metric: "volume" },
      { exercise: id, weeks: "8", metric: "other" },
      { exercise: [id, id], weeks: "8", metric: "1rm" },
      { exercise: "https://evil.test", weeks: "8", metric: "1rm" },
    ])
      expect(progressReturn(params, [id])).toBeNull();
  });
});
