import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { trainingHistoryFixture } from "@/test/fixtures/training-history";
import { readVisibleTrainingHistory, TrainingHistoryReadError } from "./training-history";
function client(reply: unknown) {
  const rpc = vi.fn(async () => reply);
  return { rpc, db: { rpc } as unknown as SupabaseClient<Database> };
}
describe("fuente de historial visible (T219)", () => {
  it("consulta una sola instantánea autenticada y confirma su identidad", async () => {
    const value = trainingHistoryFixture(),
      { rpc, db } = client({ data: value, error: null });
    const result = await readVisibleTrainingHistory(db, value.student.id.toUpperCase());
    expect(result?.student.id).toBe(value.student.id);
    expect(result?.workouts[0].sets).toHaveLength(9);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_visible_training_history", {
      p_student_id: value.student.id,
    });
  });
  it("un perfil no visible devuelve el mismo resultado que uno inexistente", async () => {
    const { db } = client({ data: null, error: null });
    expect(await readVisibleTrainingHistory(db, crypto.randomUUID())).toBeNull();
  });
  it("una identidad inválida no provoca una consulta", async () => {
    const { rpc, db } = client({ data: null, error: null });
    expect(await readVisibleTrainingHistory(db, "no-es-id")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rechaza identidad distinta y formatos futuros sin degradar o filtrar sus datos", async () => {
    const value = trainingHistoryFixture();
    for (const data of [
      { ...value, version: 2 },
      { ...value, extra: 1 },
      { ...value, student: { ...value.student, id: crypto.randomUUID() } },
    ]) {
      const { db } = client({ data, error: null });
      await expect(readVisibleTrainingHistory(db, value.student.id)).rejects.toMatchObject({
        code: "incompatible",
      });
    }
  });
  it.each([
    ["0A000", "capacity"],
    ["42501", "unauthorized"],
    ["XX000", "unavailable"],
  ])("traduce %s sin detalles internos", async (code, expected) => {
    const { db } = client({ data: null, error: { code, message: "SQL interno y datos privados" } });
    try {
      await readVisibleTrainingHistory(db, crypto.randomUUID());
      throw Error("debía rechazar");
    } catch (error) {
      expect(error).toBeInstanceOf(TrainingHistoryReadError);
      expect(error).toMatchObject({ code: expected });
      expect(String(error)).not.toContain("SQL interno");
    }
  });
});
