import { describe, expect, it } from "vitest";
import {
  isWeekEditable,
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

describe("pickCurrentProgram (RF-18, DC-10: un solo programa activo)", () => {
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

describe("isWeekEditable (RF-17: solo semanas posteriores a la semana en curso)", () => {
  it("una plantilla (sin fechas) se edita entera", () => {
    expect(isWeekEditable(null, 1, "2026-10-20")).toBe(true);
    expect(isWeekEditable(null, 16, "2026-10-20")).toBe(true);
  });

  it("un programa programado a futuro se edita entero", () => {
    expect(isWeekEditable(program, 1, "2026-09-30")).toBe(true);
    expect(isWeekEditable(program, 3, "2026-09-30")).toBe(true);
  });

  it("en un programa activo solo se editan las semanas posteriores a la actual", () => {
    // hoy es miércoles de la semana 2
    expect(isWeekEditable(program, 1, "2026-10-14")).toBe(false);
    expect(isWeekEditable(program, 2, "2026-10-14")).toBe(false);
    expect(isWeekEditable(program, 3, "2026-10-14")).toBe(true);
  });

  it("el primer día de una semana ya la bloquea; el último día de la anterior todavía no", () => {
    expect(isWeekEditable(program, 2, "2026-10-11")).toBe(true); // domingo de la semana 1
    expect(isWeekEditable(program, 2, "2026-10-12")).toBe(false); // lunes de la semana 2
  });

  it("un programa terminado no se edita", () => {
    expect(isWeekEditable(program, 1, "2026-10-26")).toBe(false);
    expect(isWeekEditable(program, 3, "2026-10-26")).toBe(false);
  });

  it("las semanas que el recorte dejó fuera del rango no se editan", () => {
    const truncated: ProgramRange = { ...program, endsOn: "2026-10-11" }; // solo la semana 1 corre
    expect(isWeekEditable(truncated, 2, "2026-10-05")).toBe(false);
  });

  it("una semana fuera del programa no existe", () => {
    expect(isWeekEditable(program, 0, "2026-09-30")).toBe(false);
    expect(isWeekEditable(program, 4, "2026-09-30")).toBe(false);
  });
});
