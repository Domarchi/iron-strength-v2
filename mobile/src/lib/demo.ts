import { mobileRoutineSchema, type MobileRoutine } from "../../../src/lib/mobile/contracts";
const id = (n: number) => `d34f0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rx = (sets: number, min: number, max = min) => ({
  sets,
  repsMin: min,
  repsMax: max,
  targetWeightKg: null,
});
function exercise(
  n: number,
  name: string,
  sets: number,
  min: number,
  max: number,
  extra: Partial<MobileRoutine["exercises"][number]> = {},
) {
  return {
    sessionExerciseId: id(n + 100),
    exerciseId: id(n),
    name,
    isBodyweight: false,
    prescribed: rx(sets, min, max),
    note: null,
    restSeconds: 90,
    ...extra,
  };
}
export const DEMO_ROUTINES: MobileRoutine[] = [
  {
    version: 1,
    session: {
      id: id(901),
      programId: id(900),
      label: "A",
      title: "Fuerza de cuerpo completo",
      programName: "Tu primera semana · Demo",
      weekNumber: 1,
      weeksCount: 4,
    },
    exercises: [
      exercise(1, "Sentadilla goblet", 3, 8, 10, {
        note: "Ejemplo sin carga indicada. Escribe los valores que quieras probar.",
      }),
      exercise(2, "Press con mancuernas", 3, 8, 12),
      exercise(3, "Remo con mancuerna", 3, 10, 12),
      exercise(4, "Dead bug", 2, 8, 10, { isBodyweight: true, restSeconds: 60 }),
    ],
  },
  {
    version: 1,
    session: {
      id: id(902),
      programId: id(900),
      label: "B",
      title: "Torso y superseries",
      programName: "Tu primera semana · Demo",
      weekNumber: 1,
      weeksCount: 4,
    },
    exercises: [
      exercise(5, "Jalón al pecho", 3, 8, 12, {
        alternatives: [
          {
            exerciseId: id(6),
            name: "Remo en polea",
            isBodyweight: false,
            prescribed: rx(3, 10, 12),
          },
        ],
      }),
      exercise(7, "Press de hombros", 3, 8, 10),
      exercise(8, "Curl de bíceps", 2, 10, 12, {
        supersetId: id(800),
        supersetRestSeconds: 60,
        restSeconds: null,
      }),
      exercise(9, "Extensión de tríceps", 2, 10, 12, {
        supersetId: id(800),
        supersetRestSeconds: 60,
        restSeconds: null,
        note: "Alterna con bíceps. Descansa después de completar ambos ejercicios.",
      }),
    ],
  },
  {
    version: 1,
    session: {
      id: id(903),
      programId: id(900),
      label: "C",
      title: "Piernas y control",
      programName: "Tu primera semana · Demo",
      weekNumber: 1,
      weeksCount: 4,
    },
    exercises: [
      exercise(10, "Peso muerto rumano", 3, 8, 10),
      exercise(11, "Zancadas", 3, 10, 12),
      exercise(12, "Puente de glúteos", 3, 12, 15, { isBodyweight: true, restSeconds: 60 }),
      exercise(13, "Elevación de talones", 2, 12, 15, { isBodyweight: true, restSeconds: 60 }),
    ],
  },
].map((r) => mobileRoutineSchema.parse(r));
export const demoRoutine = (slug: string) =>
  DEMO_ROUTINES.find((r) => `demo-${r.session.label.toLowerCase()}` === slug) ?? null;
export const demoSlug = (r: MobileRoutine) => `demo-${r.session.label.toLowerCase()}`;
