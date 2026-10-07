import { describe, expect, it } from "vitest";
import {
  pickCurrentProgram,
  programState,
  programWeekNumber,
  programWeekStart,
  type ProgramRange,
} from "./program-weeks";

// 3 semanas desde el lunes 2026-10-05 hasta el domingo 2026-10-25
const program: ProgramRange = { startDate: "2026-10-05", endsOn: "2026-10-25", weeksCount: 3 };

describe("programWeekNumber", () => {
  it("la semana 1 empieza el lunes de inicio y dura hasta el domingo", () => {
    expect(programWeekNumber(program, "2026-10-05")).toBe(1);
    expect(programWeekNumber(program, "2026-10-07")).toBe(1);
    expect(programWeekNumber(program, "2026-10-11")).toBe(1);
  });

  it("avanza cada lunes", () => {
    expect(programWeekNumber(program, "2026-10-12")).toBe(2);
    expect(programWeekNumber(program, "2026-10-19")).toBe(3);
    expect(programWeekNumber(program, "2026-10-25")).toBe(3);
  });

  it("fuera del rango no hay semana", () => {
    expect(programWeekNumber(program, "2026-10-04")).toBeNull();
    expect(programWeekNumber(program, "2026-10-26")).toBeNull();
  });

  it("un programa recortado por uno nuevo termina en su ends_on", () => {
    const truncated: ProgramRange = { ...program, endsOn: "2026-10-18" }; // termina tras la semana 2
    expect(programWeekNumber(truncated, "2026-10-18")).toBe(2);
    expect(programWeekNumber(truncated, "2026-10-19")).toBeNull();
  });
});

describe("programWeekStart", () => {
  it("devuelve el lunes de cada semana del programa", () => {
    expect(programWeekStart(program, 1)).toBe("2026-10-05");
    expect(programWeekStart(program, 3)).toBe("2026-10-19");
  });
});

describe("programState", () => {
  it("programado antes de empezar, activo durante, terminado después", () => {
    expect(programState(program, "2026-10-04")).toBe("scheduled");
    expect(programState(program, "2026-10-05")).toBe("active");
    expect(programState(program, "2026-10-25")).toBe("active");
    expect(programState(program, "2026-10-26")).toBe("finished");
  });
});

describe("pickCurrentProgram (RF-18: un solo programa activo)", () => {
  const next: ProgramRange = { startDate: "2026-10-26", endsOn: "2026-11-08", weeksCount: 2 };

  it("elige el programa activo de hoy", () => {
    expect(pickCurrentProgram([program, next], "2026-10-20")).toEqual({ program, state: "active" });
    expect(pickCurrentProgram([program, next], "2026-10-27")).toEqual({
      program: next,
      state: "active",
    });
  });

  it("sin activo, devuelve el próximo programado", () => {
    expect(pickCurrentProgram([next], "2026-10-20")).toEqual({ program: next, state: "scheduled" });
  });

  it("sin activo ni programado, devuelve el último terminado", () => {
    expect(pickCurrentProgram([program], "2026-12-01")).toEqual({ program, state: "finished" });
    expect(pickCurrentProgram([program, next], "2026-12-01")).toEqual({
      program: next,
      state: "finished",
    });
  });

  it("sin programas devuelve null", () => {
    expect(pickCurrentProgram([], "2026-10-20")).toBeNull();
  });

  it("no depende del orden de la lista", () => {
    expect(pickCurrentProgram([next, program], "2026-10-20")?.program).toEqual(program);
  });
});
