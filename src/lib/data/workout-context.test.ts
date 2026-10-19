import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { getWorkoutContext } from "./workout-context";

function client(studentId = "student-1") {
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
                session_exercises: [],
              }
            : [],
        ),
    },
  });
}

describe("recuperación de una sesión al cambiar de semana (RF-22, RF-24)", () => {
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
