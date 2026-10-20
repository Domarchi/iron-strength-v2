import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { getWorkoutContext } from "./workout-context";

function client(studentId = "student-1", withExercise = false, tiedPositions = false) {
  return createClient<Database>("http://127.0.0.1:54321", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) =>
        Response.json(
          String(input).includes("program_sessions")
            ? {
                id: "session-1",
                week_number: 1,
                label: "A",
                program_id: "program-1",
                programs: {
                  name: "Fuerza",
                  start_date: "2026-10-12",
                  ends_on: "2026-10-25",
                  weeks_count: 2,
                  student_id: studentId,
                },
                session_exercises: withExercise
                  ? [
                      {
                        id: "se1",
                        exercise_id: "ex1",
                        position: 0,
                        sets: 3,
                        reps_min: 8,
                        reps_max: 12,
                        target_weight_kg: 60,
                        note: null,
                        session_exercise_alternatives: [],
                        exercises: {
                          name: "Sentadilla",
                          muscle_group: "Piernas",
                          equipment: "Barra",
                          is_bodyweight: false,
                          progression_increment_kg: 2.5,
                        },
                      },
                    ].flatMap((row) => (tiedPositions ? [{ ...row, id: "se2" }, row] : [row]))
                  : [],
              }
            : [],
        ),
    },
  });
}

describe("recuperación de una sesión al cambiar de semana (RF-22, RF-24)", () => {
  it("incluye el grupo muscular y equipo reales del catálogo para el registro", async () => {
    const result = await getWorkoutContext(
      client("student-1", true),
      "student-1",
      "session-1",
      "2026-10-18",
    );
    expect(result).toMatchObject({
      ok: true,
      context: { exercises: [{ name: "Sentadilla", muscleGroup: "Piernas", equipment: "Barra" }] },
    });
  });
  it("una sesión actual permite iniciar y recuperar", async () => {
    expect(await getWorkoutContext(client(), "student-1", "session-1", "2026-10-18")).toMatchObject(
      { ok: true, canStart: true },
    );
  });

  it("una sesión pasada sigue bloqueada para iniciar una nueva", async () => {
    expect(await getWorkoutContext(client(), "student-1", "session-1", "2026-10-19")).toEqual({
      ok: false,
      reason: "not_current_week",
    });
  });

  it("permite cargar una sesión pasada únicamente para recuperar el borrador", async () => {
    expect(
      await getWorkoutContext(client(), "student-1", "session-1", "2026-10-19", true),
    ).toMatchObject({ ok: true, canStart: false });
  });

  it("también permite recuperar después de terminar el programa", async () => {
    expect(
      await getWorkoutContext(client(), "student-1", "session-1", "2026-11-02", true),
    ).toMatchObject({ ok: true, canStart: false });
  });

  it("el modo recuperación no habilita una sesión futura ni ajena", async () => {
    expect(await getWorkoutContext(client(), "student-1", "session-1", "2026-10-05", true)).toEqual(
      { ok: false, reason: "not_current_week" },
    );
    expect(
      await getWorkoutContext(client("other"), "student-1", "session-1", "2026-10-19", true),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

it("desempata posiciones antiguas por ID igual que la autorización SQL", async () => {
  const result = await getWorkoutContext(
    client("student-1", true, true),
    "student-1",
    "session-1",
    "2026-10-18",
  );
  expect(result.ok && result.context.exercises.map((e) => e.sessionExerciseId)).toEqual([
    "se1",
    "se2",
  ]);
});
