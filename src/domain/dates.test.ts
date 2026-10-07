import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  defaultStartDate,
  isMonday,
  mondayOf,
  santiagoDate,
  weekDates,
  weekStartOf,
} from "./dates";

describe("santiagoDate (America/Santiago)", () => {
  it("convierte un instante a la fecha local", () => {
    // Octubre: UTC-3 (horario de verano). 02:30Z = 23:30 del día anterior.
    expect(santiagoDate(new Date("2026-10-01T02:30:00Z"))).toBe("2026-09-30");
    expect(santiagoDate(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10-01");
  });

  it("en invierno el desfase es UTC-4", () => {
    expect(santiagoDate(new Date("2026-07-01T03:59:00Z"))).toBe("2026-06-30");
    expect(santiagoDate(new Date("2026-07-01T04:00:00Z"))).toBe("2026-07-01");
  });

  it("fin del horario de verano (1er sábado de abril): la hora 23:00 se repite y no cambia el día", () => {
    // 2026-04-04 24:00 (UTC-3) los relojes retroceden a 23:00 (UTC-4).
    expect(santiagoDate(new Date("2026-04-05T02:30:00Z"))).toBe("2026-04-04"); // 23:30 (1ª vez)
    expect(santiagoDate(new Date("2026-04-05T03:30:00Z"))).toBe("2026-04-04"); // 23:30 (2ª vez)
    expect(santiagoDate(new Date("2026-04-05T04:00:00Z"))).toBe("2026-04-05"); // medianoche real
  });

  it("inicio del horario de verano (1er sábado de septiembre): la hora 00:00-00:59 no existe", () => {
    // 2026-09-05 24:00 (UTC-4) los relojes adelantan a 01:00 (UTC-3).
    expect(santiagoDate(new Date("2026-09-06T03:59:59Z"))).toBe("2026-09-05");
    expect(santiagoDate(new Date("2026-09-06T04:00:00Z"))).toBe("2026-09-06"); // 01:00 del domingo
  });
});

describe("aritmética de fechas (YYYY-MM-DD)", () => {
  it("suma días cruzando meses, años y bisiestos", () => {
    expect(addDays("2026-10-07", 7)).toBe("2026-10-14");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-10-07", -7)).toBe("2026-09-30");
  });

  it("calcula la diferencia en días", () => {
    expect(daysBetween("2026-10-05", "2026-10-12")).toBe(7);
    expect(daysBetween("2026-10-12", "2026-10-05")).toBe(-7);
    expect(daysBetween("2026-10-05", "2026-10-05")).toBe(0);
  });

  it("reconoce los lunes", () => {
    expect(isMonday("2026-10-05")).toBe(true);
    expect(isMonday("2026-10-07")).toBe(false);
    expect(isMonday("2026-10-04")).toBe(false);
  });

  it("devuelve el lunes de la semana de cualquier día (semana lunes a domingo)", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // lunes
    expect(mondayOf("2026-10-07")).toBe("2026-10-05"); // miércoles
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // domingo: pertenece a la semana que termina
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28"); // cruce de año
  });

  it("lista los 7 días de una semana", () => {
    expect(weekDates("2026-10-05")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });
});

describe("weekStartOf (semana de un instante en Santiago)", () => {
  it("el domingo por la noche sigue en la semana que termina", () => {
    // Domingo 2026-10-04 23:30 Santiago = 2026-10-05T02:30Z
    expect(weekStartOf(new Date("2026-10-05T02:30:00Z"))).toBe("2026-09-28");
  });

  it("el lunes después de medianoche ya es la semana nueva", () => {
    // Lunes 2026-10-05 00:30 Santiago = 03:30Z
    expect(weekStartOf(new Date("2026-10-05T03:30:00Z"))).toBe("2026-10-05");
  });

  it("no cambia de semana con el cambio de hora de septiembre", () => {
    expect(weekStartOf(new Date("2026-09-06T03:59:59Z"))).toBe("2026-08-31"); // sáb 5 23:59
    expect(weekStartOf(new Date("2026-09-06T04:00:00Z"))).toBe("2026-08-31"); // dom 6 01:00
    expect(weekStartOf(new Date("2026-09-07T04:00:00Z"))).toBe("2026-09-07"); // lun 7 01:00
  });

  it("no cambia de semana con el cambio de hora de abril", () => {
    expect(weekStartOf(new Date("2026-04-05T03:30:00Z"))).toBe("2026-03-30"); // sáb 4 23:30 (2ª vez)
    expect(weekStartOf(new Date("2026-04-06T03:30:00Z"))).toBe("2026-03-30"); // dom 5 23:30 (UTC-4)
    expect(weekStartOf(new Date("2026-04-06T04:30:00Z"))).toBe("2026-04-06"); // lun 6 00:30 (UTC-4)
  });
});

describe("defaultStartDate (inicio sugerido de un programa)", () => {
  it("si hoy es lunes, empieza hoy", () => {
    expect(defaultStartDate("2026-10-05")).toBe("2026-10-05");
  });

  it("cualquier otro día, el lunes siguiente", () => {
    expect(defaultStartDate("2026-10-06")).toBe("2026-10-12");
    expect(defaultStartDate("2026-10-07")).toBe("2026-10-12");
    expect(defaultStartDate("2026-10-11")).toBe("2026-10-12"); // domingo
  });
});
