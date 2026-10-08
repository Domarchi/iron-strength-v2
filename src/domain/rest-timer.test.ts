import { describe, expect, it } from "vitest";
import {
  DEFAULT_REST_SECONDS,
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  WARMUP_REST_SECONDS,
  adjustRest,
  formatClock,
  remainingSeconds,
  startRest,
} from "./rest-timer";

describe("startRest (RF-27)", () => {
  it("descansa 90 s tras una serie de trabajo y 60 s tras un calentamiento", () => {
    expect(DEFAULT_REST_SECONDS).toBe(90);
    expect(WARMUP_REST_SECONDS).toBe(60);
    const now = 1_000_000;
    expect(startRest(now, false)).toEqual({ endsAt: now + 90_000, totalSeconds: 90 });
    expect(startRest(now, true)).toEqual({ endsAt: now + 60_000, totalSeconds: 60 });
  });
});

describe("remainingSeconds", () => {
  const rest = { endsAt: 100_000, totalSeconds: 90 };

  it("se calcula desde la hora de término, así sobrevive a un bloqueo de pantalla", () => {
    expect(remainingSeconds(rest, 10_000)).toBe(90);
    expect(remainingSeconds(rest, 70_000)).toBe(30);
  });

  it("redondea hacia arriba y nunca baja de cero", () => {
    expect(remainingSeconds(rest, 99_001)).toBe(1);
    expect(remainingSeconds(rest, 100_000)).toBe(0);
    expect(remainingSeconds(rest, 500_000)).toBe(0);
  });
});

describe("adjustRest", () => {
  const rest = { endsAt: 100_000, totalSeconds: 90 };

  it("suma o resta 15 s al tiempo que queda", () => {
    const now = 40_000; // quedan 60 s
    expect(remainingSeconds(adjustRest(rest, now, 15), now)).toBe(75);
    expect(remainingSeconds(adjustRest(rest, now, -15), now)).toBe(45);
  });

  it("no baja de 15 s ni pasa de 10 min", () => {
    const now = 90_000; // quedan 10 s
    expect(remainingSeconds(adjustRest(rest, now, -15), now)).toBe(MIN_REST_SECONDS);
    const long = { endsAt: now + 595_000, totalSeconds: 595 };
    expect(remainingSeconds(adjustRest(long, now, 15), now)).toBe(MAX_REST_SECONDS);
  });

  it("el total crece con lo que se agrega para que la barra de avance no se desborde", () => {
    const now = 10_000;
    const longer = adjustRest(rest, now, 15);
    expect(longer.totalSeconds).toBeGreaterThanOrEqual(remainingSeconds(longer, now));
  });
});

describe("formatClock", () => {
  it("m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(600)).toBe("10:00");
  });

  it("ignora negativos", () => {
    expect(formatClock(-3)).toBe("0:00");
  });
});
