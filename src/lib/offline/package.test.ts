import { describe, expect, it } from "vitest";
import { canStartDownloadedSession, parseWeekPackage } from "./package";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sample = () => ({
  version: 1,
  userId: id(1),
  downloadedAt: "2026-10-20T12:00:00Z",
  program: {
    id: id(2),
    name: "Fuerza",
    startDate: "2026-10-19",
    endsOn: "2026-11-01",
    weeksCount: 2,
  },
  weekNumber: 1,
  weekStart: "2026-10-19",
  weekEnd: "2026-10-25",
  sessions: [
    {
      revision: 2,
      weekday: 1,
      context: {
        session: {
          id: id(3),
          label: "A",
          programId: id(2),
          programName: "Fuerza",
          weekNumber: 1,
          weeksCount: 2,
        },
        exercises: [
          {
            sessionExerciseId: id(4),
            exerciseId: id(5),
            name: "Sentadilla",
            isBodyweight: false,
            prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: null },
            lastWeightKg: null,
            note: null,
            last: null,
            suggestion: null,
            alternatives: [
              {
                sessionExerciseId: id(4),
                exerciseId: id(6),
                name: "Prensa",
                isBodyweight: false,
                prescribed: { sets: 2, repsMin: 10, repsMax: 12, targetWeightKg: 50 },
                lastWeightKg: null,
                note: null,
                last: null,
                suggestion: null,
              },
            ],
          },
        ],
      },
    },
  ],
  history: { [id(5)]: { items: [], nextCursor: null }, [id(6)]: { items: [], nextCursor: null } },
});
describe("paquete descargado v1", () => {
  it("conserva contexto y alternativas sin aceptar identidad ajena ni formato futuro", () => {
    expect(parseWeekPackage(sample(), id(1))).toEqual(sample());
    expect(parseWeekPackage(sample(), id(7))).toBeNull();
    expect(parseWeekPackage({ ...sample(), version: 2 }, id(1))).toBeNull();
    expect(parseWeekPackage({ ...sample(), accessToken: "no guardar" }, id(1))).toEqual(sample());
  });
  it("rechaza descargas incompletas, referencias cruzadas y fechas incoherentes", () => {
    const p = sample();
    delete (p.history as Record<string, unknown>)[id(6)];
    expect(parseWeekPackage(p, id(1))).toBeNull();
    const q = sample();
    q.sessions[0].context.session.programId = id(7);
    expect(parseWeekPackage(q, id(1))).toBeNull();
    expect(parseWeekPackage({ ...sample(), weekEnd: "2026-10-26" }, id(1))).toBeNull();
    const r = sample();
    r.sessions.push(r.sessions[0]);
    expect(parseWeekPackage(r, id(1))).toBeNull();
  });
  it("permite iniciar solo durante la semana y vigencia conocidas, con sesión del paquete", () => {
    const p = parseWeekPackage(sample(), id(1))!;
    expect(canStartDownloadedSession(p, id(3), "2026-10-20")).toBe(true);
    expect(canStartDownloadedSession(p, id(3), "2026-10-26")).toBe(false);
    expect(canStartDownloadedSession(p, id(3), "2026-10-18")).toBe(false);
    expect(canStartDownloadedSession(p, id(7), "2026-10-20")).toBe(false);
    expect(
      canStartDownloadedSession(
        { ...p, program: { ...p.program, endsOn: "2026-10-20" } },
        id(3),
        "2026-10-21",
      ),
    ).toBe(false);
  });
});
