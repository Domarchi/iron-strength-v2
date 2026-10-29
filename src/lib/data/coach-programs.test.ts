import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";
import { getCoachProgramTree, listCoachCatalog } from "./coach-programs";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";

const id = crypto.randomUUID();
function client(body: unknown, range?: string, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "content-type": "application/json",
          ...(range ? { "content-range": range } : {}),
        },
      }),
  );
  const db = createClient<Database>("https://isolated-reader.invalid", "test-publishable-key", {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { db, fetch };
}
const exercise = {
  id,
  name: "Ejercicio",
  muscle_group: "Core",
  equipment: null,
  record_type: "duration",
};
describe("T219 · fronteras del lector canónico", () => {
  it("pide un catálogo cerrado de ejercicios compartidos y un conteo de la misma consulta", async () => {
    const { db, fetch } = client([exercise], "0-0/1");
    expect(await listCoachCatalog(db)).toEqual([
      { id, name: "Ejercicio", muscleGroup: "Core", equipment: null, recordType: "duration" },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = new URL(String(fetch.mock.calls[0][0]));
    expect(request.searchParams.get("personal_owner_id")).toBe("is.null");
    expect(request.searchParams.get("archived_at")).toBe("is.null");
  });
  it.each([undefined, "0-0/2", "0-0/1001", "0-0/*"])(
    "no devuelve un catálogo parcial con conteo %s",
    async (range) => {
      await expect(listCoachCatalog(client([exercise], range).db)).rejects.toThrow(
        "completar el catálogo",
      );
    },
  );
  it("rechaza duplicados y tipos futuros sin reinterpretarlos", async () => {
    await expect(listCoachCatalog(client([exercise, exercise], "0-1/2").db)).rejects.toThrow(
      "completar el catálogo",
    );
    await expect(
      listCoachCatalog(client([{ ...exercise, record_type: "future" }], "0-0/1").db),
    ).rejects.toThrow();
  });
  it("no filtra mensajes internos ni confunde un error con ausencia de programa", async () => {
    const { db } = client(
      { code: "42501", message: "internal private details", details: "private" },
      undefined,
      403,
    );
    await expect(getCoachProgramTree(db, id)).rejects.toThrow("No se pudo cargar el programa");
    await expect(listCoachCatalog(db)).rejects.toThrow("No se pudo completar el catálogo");
  });
  it("mantiene ausencia sin consultas adicionales", async () => {
    const { db, fetch } = client(null);
    expect(await getCoachProgramTree(db, id)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rechaza una prescripción futura, fuentes dobles y tipo real incompatible", async () => {
    const prescribed = parsePrescriptionInput(defaultPrescriptionInput("duration"));
    const row = {
      id,
      exercise_id: id,
      position: 0,
      sets: 3,
      reps_min: null,
      reps_max: null,
      target_weight_kg: null,
      prescription_sets: null,
      typed_prescription: prescribed,
      note: null,
      rest_seconds: null,
      superset_id: null,
      superset_rest_seconds: null,
      exercises: {
        ...exercise,
        is_bodyweight: false,
        progression_increment_kg: 2.5,
        archived_at: null,
      },
      session_exercise_alternatives: [],
    };
    const tree = (r: unknown) => ({
      id,
      coach_id: id,
      student_id: null,
      name: "Base",
      weeks_count: 4,
      start_date: null,
      ends_on: null,
      program_sessions: [
        {
          id,
          revision: 3,
          title: null,
          weekday: null,
          week_number: 1,
          label: "A",
          position: 0,
          session_exercises: [r],
        },
      ],
    });
    for (const invalid of [
      { ...row, typed_prescription: { version: 99 } },
      { ...row, reps_min: 8 },
      { ...row, exercises: { ...row.exercises, record_type: "weight_duration" } },
      { ...row, exercises: null },
      {
        ...row,
        session_exercise_alternatives: [
          {
            ...row,
            exercises: { name: "Alternativa", record_type: "weight_duration", archived_at: null },
          },
        ],
      },
    ]) {
      await expect(getCoachProgramTree(client(tree(invalid)).db, id)).rejects.toThrow(
        "prescripción no compatible",
      );
    }
  });
});
