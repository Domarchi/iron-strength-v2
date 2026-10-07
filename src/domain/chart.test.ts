import { describe, expect, it } from "vitest";
import { buildChart, niceTicks } from "./chart";

describe("niceTicks", () => {
  it("elige marcas redondas que cubren el rango", () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(52, 68, 4)).toEqual([50, 55, 60, 65, 70]);
  });

  it("un rango de un solo valor produce marcas alrededor", () => {
    const ticks = niceTicks(60, 60, 4);
    expect(ticks[0]).toBeLessThanOrEqual(60);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(60);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it("maneja decimales pequeños sin errores de coma flotante", () => {
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe("buildChart", () => {
  const points = [
    { x: "2026-10-01", y: 80 },
    { x: "2026-10-08", y: 90 },
    { x: "2026-10-15", y: 85 },
  ];

  it("sin puntos devuelve un gráfico vacío", () => {
    expect(buildChart([], { width: 300, height: 150 })).toMatchObject({ points: [], path: "" });
  });

  it("mapea los puntos dentro del área y mantiene el orden (más reciente a la derecha)", () => {
    const chart = buildChart(points, {
      width: 300,
      height: 150,
      padding: { top: 10, right: 10, bottom: 20, left: 30 },
    });
    expect(chart.points).toHaveLength(3);
    expect(chart.points[0].px).toBe(30);
    expect(chart.points[2].px).toBe(290);
    expect(chart.points[1].py).toBeLessThan(chart.points[0].py); // 90 está más arriba que 80
    expect(chart.path.startsWith("M")).toBe(true);
  });

  it("un solo punto se dibuja al centro y no genera NaN", () => {
    const chart = buildChart([points[0]], { width: 300, height: 150 });
    expect(chart.points).toHaveLength(1);
    expect(Number.isFinite(chart.points[0].px)).toBe(true);
    expect(Number.isFinite(chart.points[0].py)).toBe(true);
  });

  it("el eje Y cubre todos los valores", () => {
    const chart = buildChart(points, { width: 300, height: 150 });
    expect(chart.yTicks[0]).toBeLessThanOrEqual(80);
    expect(chart.yTicks.at(-1)).toBeGreaterThanOrEqual(90);
  });

  it("valores iguales no dividen por cero", () => {
    const flat = buildChart(
      [
        { x: "a", y: 50 },
        { x: "b", y: 50 },
      ],
      { width: 300, height: 150 },
    );
    expect(flat.points.every((p) => Number.isFinite(p.py))).toBe(true);
  });
});
