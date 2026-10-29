import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
const mocks = vi.hoisted(() => ({ legacy: vi.fn(), typed: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("./workouts", () => ({ getWorkoutDetail: mocks.legacy }));
vi.mock("./typed-recordings", () => ({ getTypedWorkoutDetail: mocks.typed }));
import { getWorkoutResult } from "./workout-result";
const id = "af214000-0000-4000-8000-000000000001";
const owner = "af214000-0000-4000-8000-000000000002";
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  maybeSingle: mocks.maybeSingle,
};
const db = { from: vi.fn(() => chain) } as unknown as SupabaseClient<Database>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.maybeSingle.mockResolvedValue({
    data: { student_id: owner, structure: null },
    error: null,
  });
  mocks.legacy.mockResolvedValue({ id, studentId: owner });
  mocks.typed.mockResolvedValue({ version: 3, workout: { id } });
});
it("un resultado ausente o invisible no abre lectores ni revela su dueño", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await getWorkoutResult(db, id)).toBeNull();
  mocks.maybeSingle.mockResolvedValue({
    data: null,
    error: { code: "42501", message: "permission denied" },
  });
  expect(await getWorkoutResult(db, id)).toBeNull();
  expect(mocks.typed).not.toHaveBeenCalled();
  expect(mocks.legacy).not.toHaveBeenCalled();
});
it("conserva el lector anterior y lo restringe al dueño real obtenido con RLS", async () => {
  expect(await getWorkoutResult(db, id)).toMatchObject({ kind: "legacy", studentId: owner });
  expect(mocks.legacy).toHaveBeenCalledWith(db, id, owner);
  expect(mocks.typed).not.toHaveBeenCalled();
});
it("una estructura2 usa solo el lector tipado sin proyección a peso/repeticiones", async () => {
  mocks.maybeSingle.mockResolvedValue({
    data: { student_id: owner, structure: { version: 2 } },
    error: null,
  });
  expect(await getWorkoutResult(db, id)).toMatchObject({ kind: "typed", studentId: owner });
  expect(mocks.typed).toHaveBeenCalledWith(db, id, owner);
  expect(mocks.legacy).not.toHaveBeenCalled();
});
it("versiones futuras y errores no degradan a un lector anterior", async () => {
  for (const value of [{ version: 99 }, [], "invalid", {}]) {
    mocks.maybeSingle.mockResolvedValue({
      data: { student_id: owner, structure: value },
      error: null,
    });
    await expect(getWorkoutResult(db, id)).rejects.toThrow();
  }
  mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "private connection" } });
  await expect(getWorkoutResult(db, id)).rejects.toThrow("No pudimos cargar el entrenamiento.");
  expect(mocks.typed).not.toHaveBeenCalled();
  expect(mocks.legacy).not.toHaveBeenCalled();
});
it("una eliminación entre consultas se presenta como ausente, sin datos previos", async () => {
  mocks.maybeSingle.mockResolvedValue({
    data: { student_id: owner, structure: { version: 2 } },
    error: null,
  });
  mocks.typed.mockResolvedValue(null);
  expect(await getWorkoutResult(db, id)).toBeNull();
  expect(mocks.legacy).not.toHaveBeenCalled();
});
