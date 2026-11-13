import { describe, expect, it } from "vitest";
import { parseMeasurement } from "./measurement-input";

const empty = { weightKg: "", waistCm: "", chestCm: "", armCm: "" };
describe("parseMeasurement", () => {
  it("lee coma o punto y deja en blanco lo no ingresado", () => {
    expect(parseMeasurement({ ...empty, weightKg: "80,5", waistCm: "82.5" })).toEqual({
      ok: true,
      value: { weightKg: 80.5, waistCm: 82.5, chestCm: null, armCm: null },
    });
  });
  it("exige al menos una medida y rechaza texto, rangos y decimales de más", () => {
    expect(parseMeasurement(empty)).toMatchObject({
      ok: false,
      message: "Ingresa al menos una medida.",
    });
    expect(parseMeasurement({ ...empty, weightKg: "ochenta" })).toMatchObject({ ok: false });
    expect(parseMeasurement({ ...empty, weightKg: "10" })).toMatchObject({ ok: false });
    expect(parseMeasurement({ ...empty, armCm: "40,55" })).toMatchObject({ ok: false });
    expect(parseMeasurement({ ...empty, weightKg: "80,555" })).toMatchObject({ ok: false });
    expect(parseMeasurement({ ...empty, weightKg: "-5" })).toMatchObject({ ok: false });
  });
});
