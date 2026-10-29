import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { countWorkouts } from "./achievements";
const id = "a0000000-0000-4000-8000-00000000000a";
function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { db: { rpc } as unknown as SupabaseClient<Database>, rpc };
}
it("conserva el recuento exacto y un cero real sin materializar el historial", async () => {
  for (const total of [0, 1002, 10001]) {
    const { db, rpc } = client(total);
    expect(await countWorkouts(db, id)).toBe(total);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("count_visible_workouts", { p_student_id: id });
  }
});
it("un error o total incompatible nunca muestra cero ni detalles internos", async () => {
  for (const [data, error] of [
    [null, null],
    ["1002", null],
    [-1, null],
    [1.5, null],
    [Infinity, null],
    [Number.MAX_SAFE_INTEGER + 1, null],
    [0, { code: "42501", message: "detalle SQL privado" }],
  ]) {
    const { db } = client(data, error);
    await expect(countWorkouts(db, id)).rejects.toThrow(
      /^No se pudieron contar los entrenamientos\.$/,
    );
  }
});
