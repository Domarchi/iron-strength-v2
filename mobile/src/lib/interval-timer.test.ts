import { describe, expect, it } from "vitest";
import {
  intervalStatus,
  planTotalSeconds,
  roundChanged,
  validPlan,
  type IntervalPlan,
} from "./interval-timer";

const emom: IntervalPlan = { mode: "emom", rounds: 3, intervalSeconds: 60 };
const amrap: IntervalPlan = { mode: "amrap", totalSeconds: 600 };

describe("cronómetro de intervalos", () => {
  it("EMOM: cuenta la ronda y el tiempo que queda de ella", () => {
    expect(intervalStatus(emom, 0)).toMatchObject({ round: 1, remainingSeconds: 60, done: false });
    expect(intervalStatus(emom, 59_000)).toMatchObject({ round: 1, remainingSeconds: 1 });
    expect(intervalStatus(emom, 60_000)).toMatchObject({ round: 2, remainingSeconds: 60 });
    expect(intervalStatus(emom, 150_000)).toMatchObject({
      round: 3,
      remainingSeconds: 30,
      totalRemainingSeconds: 30,
    });
  });
  it("EMOM: termina exactamente al cumplir todas las rondas", () => {
    expect(intervalStatus(emom, 179_999).done).toBe(false);
    expect(intervalStatus(emom, 180_000)).toMatchObject({
      done: true,
      remainingSeconds: 0,
      round: 3,
    });
    expect(intervalStatus(emom, 999_999).done).toBe(true);
  });
  it("AMRAP: cuenta hacia atrás el tiempo total y nunca queda negativo", () => {
    expect(intervalStatus(amrap, 0)).toMatchObject({ remainingSeconds: 600, done: false });
    expect(intervalStatus(amrap, 1_500)).toMatchObject({ remainingSeconds: 599 });
    expect(intervalStatus(amrap, 600_000).done).toBe(true);
    expect(intervalStatus(amrap, -50).remainingSeconds).toBe(600);
  });
  it("avisa solo cuando cambia la ronda de un EMOM en curso", () => {
    expect(roundChanged(emom, 59_000, 60_000)).toBe(true);
    expect(roundChanged(emom, 10_000, 20_000)).toBe(false);
    expect(roundChanged(amrap, 0, 599_000)).toBe(false);
    expect(roundChanged(emom, 180_000, 190_000)).toBe(false);
  });
  it("valida rangos razonables y calcula la duración total", () => {
    expect(planTotalSeconds(emom)).toBe(180);
    expect(planTotalSeconds(amrap)).toBe(600);
    expect(validPlan(emom)).toBe(true);
    expect(validPlan({ mode: "emom", rounds: 0, intervalSeconds: 60 })).toBe(false);
    expect(validPlan({ mode: "emom", rounds: 3, intervalSeconds: 10 })).toBe(false);
    expect(validPlan({ mode: "amrap", totalSeconds: 90 })).toBe(false);
    expect(validPlan({ mode: "amrap", totalSeconds: 91 * 60 })).toBe(false);
    expect(validPlan({ mode: "amrap", totalSeconds: 20 * 60 })).toBe(true);
  });
});
