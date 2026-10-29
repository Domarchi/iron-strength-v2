import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { readVisibleConstancy } from "./constancy-source";
const id = "a0000000-0000-4000-8000-000000000001";
function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { db: { rpc } as unknown as SupabaseClient<Database>, rpc };
}
it("lee un snapshot autorizado y conserva la ausencia sin mezclar identidades", async () => {
  const source = { version: 1, studentId: id, programs: [], sessions: [], workouts: [] };
  const c = client(source);
  expect(await readVisibleConstancy(c.db, id.toUpperCase())).toEqual(source);
  expect(c.rpc).toHaveBeenCalledExactlyOnceWith("get_visible_constancy", { p_student_id: id });
  expect(await readVisibleConstancy(client(null).db, id)).toBeNull();
});
it("capacidad/permisos/fallo de servicio nunca se convierten en arrays vacíos", async () => {
  for (const [error, code] of [
    [{ code: "0A000", message: "detalle SQL" }, "capacity"],
    [{ code: "42501" }, "unauthorized"],
    [{ code: "57014" }, "unavailable"],
  ] as const)
    await expect(readVisibleConstancy(client(null, error).db, id)).rejects.toMatchObject({ code });
  const c = client(null);
  c.rpc.mockRejectedValue(Error("credencial privada"));
  await expect(readVisibleConstancy(c.db, id)).rejects.toMatchObject({ code: "unavailable" });
});
it("otra identidad, futuro o respuesta incompleta no son constancia cero", async () => {
  for (const source of [
    { version: 2, studentId: id, programs: [], sessions: [], workouts: [] },
    { version: 1, studentId: crypto.randomUUID(), programs: [], sessions: [], workouts: [] },
    {},
  ])
    await expect(readVisibleConstancy(client(source).db, id)).rejects.toMatchObject({
      code: "incompatible",
    });
  const c = client(null);
  await expect(readVisibleConstancy(c.db, "no-uuid")).rejects.toMatchObject({
    code: "incompatible",
  });
  expect(c.rpc).not.toHaveBeenCalled();
});
