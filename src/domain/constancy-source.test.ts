import { expect, it } from "vitest";
import { constancySourceSchema, constancySummary } from "./constancy-source";
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const fixture = () => ({
  version: 1,
  studentId: id(1),
  programs: [{ id: id(2), weeksCount: 2, startDate: "2026-10-12", endsOn: "2026-10-25" }],
  sessions: [{ id: id(3), programId: id(2), weekNumber: 1, label: "A" }],
  workouts: [
    {
      id: id(4),
      programId: id(2),
      programSessionId: id(3),
      startedAt: "2026-10-13T15:00:00Z",
      setCount: 1,
    },
  ],
});
it("la fuente completa conserva cumplimiento, descargas y calendario con reglas existentes", () => {
  const source = constancySourceSchema.parse(fixture());
  const value = constancySummary(source, "2026-10-25", 2);
  expect(value).toMatchObject({ current: 1, longest: 1 });
  expect(value.calendar).toEqual([
    { weekStart: "2026-10-12", outcome: "complete", planned: 1, done: 1, current: false },
    { weekStart: "2026-10-19", outcome: "neutral", planned: 0, done: 0, current: true },
  ]);
  expect(constancySummary(null, "2026-10-25", 2).calendar.every((w) => w.outcome === "none")).toBe(
    true,
  );
});
it("preserva programa cancelado/fechas nulas y evidencia sin sesión sin reconstruir objetivos", () => {
  const source = fixture();
  source.programs[0].endsOn = "2026-10-11";
  expect(constancySummary(constancySourceSchema.parse(source), "2026-10-25", 2).longest).toBe(0);
  const nullable = {
    ...fixture(),
    programs: [{ id: id(2), weeksCount: 2, startDate: null, endsOn: null }],
    workouts: [{ ...fixture().workouts[0], programSessionId: null }],
  };
  expect(constancySummary(constancySourceSchema.parse(nullable), "2026-10-25").longest).toBe(0);
});
it("rechaza formatos/referencias duplicadas, futuras o ajenas y límites antes de calcular", () => {
  const s = fixture();
  for (const value of [
    { ...s, version: 2 },
    { ...s, extra: 0 },
    { ...s, programs: [...s.programs, ...s.programs] },
    { ...s, sessions: [...s.sessions, ...s.sessions] },
    { ...s, workouts: [...s.workouts, ...s.workouts] },
    { ...s, sessions: [{ ...s.sessions[0], programId: id(99) }] },
    { ...s, sessions: [{ ...s.sessions[0], weekNumber: 3 }] },
    { ...s, workouts: [{ ...s.workouts[0], programSessionId: id(99) }] },
    { ...s, workouts: [{ ...s.workouts[0], setCount: 0 }] },
    { ...s, workouts: [{ ...s.workouts[0], notes: "privado" }] },
    {
      ...s,
      programs: Array.from({ length: 10001 }, (_, i) => ({ ...s.programs[0], id: id(i + 10) })),
    },
  ])
    expect(constancySourceSchema.safeParse(value).success).toBe(false);
});
