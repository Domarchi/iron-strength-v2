import { expect, it } from "vitest";
import { scheduleState, scheduledDate, orderScheduledSessions } from "./session-schedule";
it("resuelve el día del alumno sin alterar la semana y admite rutinas sin día", () => {
  expect(scheduledDate("2026-10-19", 0, 6)).toBe("2026-10-25");
  expect(scheduledDate("2026-10-19", 2, null)).toBe("2026-10-21");
  expect(scheduledDate("2026-10-19", null, null)).toBeNull();
});
it("prevista, pendiente y completada dependen del día orientativo sin cambiar cumplimiento", () => {
  expect(scheduleState("pending", "2026-10-25", "2026-10-20")).toBe("planned");
  expect(scheduleState("pending", "2026-10-20", "2026-10-20")).toBe("pending");
  expect(scheduleState("pending", null, "2026-10-20")).toBe("pending");
  expect(scheduleState("done", "2026-10-25", "2026-10-20")).toBe("done");
});
it("ordena por día sin mutar la lista y deja sin día al final", () => {
  const sessions = [
    { id: "B", scheduledOn: null },
    { id: "A", scheduledOn: "2026-10-23" },
    { id: "C", scheduledOn: "2026-10-19" },
  ];
  expect(orderScheduledSessions(sessions).map((s) => s.id)).toEqual(["C", "A", "B"]);
  expect(sessions[0].id).toBe("B");
});
