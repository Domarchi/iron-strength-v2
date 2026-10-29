import { workoutRemovalReceiptSchema } from "@/lib/mobile/workout-removal-contracts";
import { beforeEach, expect, it, vi } from "vitest";
import {
  workoutCorrectionFixture,
  workoutCorrectionSnapshotFixture,
} from "@/test/fixtures/workout-correction";
import {
  workoutRemovalFixture,
  workoutRemovalSnapshotFixture,
} from "@/test/fixtures/workout-removal";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  db: vi.fn(),
  readCorrection: vi.fn(),
  correct: vi.fn(),
  readRemoval: vi.fn(),
  remove: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.db }));
vi.mock("@/lib/data/workout-corrections", () => ({
  readOwnWorkoutCorrection: mocks.readCorrection,
  correctOwnWorkout: mocks.correct,
}));
vi.mock("@/lib/data/workout-removals", () => ({
  readOwnWorkoutRemoval: mocks.readRemoval,
  removeOwnWorkout: mocks.remove,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import {
  readCorrectionAction,
  correctWorkoutAction,
  readRemovalAction,
  removeWorkoutAction,
} from "./actions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: workoutCorrectionSnapshotFixture().userId });
  mocks.db.mockResolvedValue("authenticated-client");
  mocks.readCorrection.mockResolvedValue(workoutCorrectionSnapshotFixture());
  mocks.readRemoval.mockResolvedValue(workoutRemovalSnapshotFixture());
  mocks.correct.mockImplementation(async (_db, input) => ({
    version: 1,
    requestId: input.requestId,
    workoutId: input.workoutId,
    revision: input.expectedRevision + 1,
    status: "updated",
  }));
  mocks.remove.mockImplementation(async (_db, input) => ({
    version: 1,
    requestId: input.requestId,
    workoutId: input.workoutId,
    revision: input.expectedRevision + 1,
    status: "deleted",
  }));
});
it("toda lectura/escritura exige sesión activa y usa cliente autenticado", async () => {
  const wid = workoutCorrectionFixture().workoutId;
  expect((await readCorrectionAction(wid)).ok).toBe(true);
  expect(mocks.readCorrection).toHaveBeenCalledWith(
    "authenticated-client",
    wid,
    workoutCorrectionSnapshotFixture().userId,
  );
  expect((await readRemovalAction(wid)).ok).toBe(true);
  expect((await correctWorkoutAction(workoutCorrectionFixture())).ok).toBe(true);
  expect((await removeWorkoutAction(workoutRemovalFixture())).ok).toBe(true);
  mocks.user.mockResolvedValue(null);
  mocks.db.mockClear();
  for (const fn of [
    () => readCorrectionAction(wid),
    () => readRemovalAction(wid),
    () => correctWorkoutAction(workoutCorrectionFixture()),
    () => removeWorkoutAction(workoutRemovalFixture()),
  ])
    expect(await fn()).toMatchObject({ ok: false, code: "unauthorized" });
  expect(mocks.db).not.toHaveBeenCalled();
});
it("no acepta propietario/campos adicionales, UUID inválido ni revisión negativa", async () => {
  expect(await readCorrectionAction("foreign/path")).toMatchObject({
    ok: false,
    code: "invalid_input",
  });
  expect(await readRemovalAction("foreign/path")).toMatchObject({
    ok: false,
    code: "invalid_input",
  });
  expect(
    await correctWorkoutAction({
      ...workoutCorrectionFixture(),
      ownerId: workoutCorrectionSnapshotFixture().userId,
    }),
  ).toMatchObject({ ok: false, code: "invalid_input" });
  expect(
    await removeWorkoutAction({ ...workoutRemovalFixture(), expectedRevision: -1 }),
  ).toMatchObject({ ok: false, code: "invalid_input" });
  expect(mocks.correct).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("ausencia/ajeno y snapshot de otra cuenta no se presentan como disponibles", async () => {
  mocks.readCorrection.mockResolvedValue(null);
  mocks.readRemoval.mockResolvedValue(null);
  expect(await readCorrectionAction(workoutCorrectionFixture().workoutId)).toMatchObject({
    ok: false,
    code: "not_found",
  });
  expect(await readRemovalAction(workoutRemovalFixture().workoutId)).toMatchObject({
    ok: false,
    code: "not_found",
  });
  mocks.readRemoval.mockResolvedValue({
    ...workoutRemovalSnapshotFixture(),
    userId: workoutRemovalFixture().workoutId,
  });
  expect(await readRemovalAction(workoutRemovalFixture().workoutId)).toMatchObject({
    ok: false,
    code: "unavailable",
  });
});
it("conserva causas de revisión/plazo/permisos/datos, sin texto SQL ni revalidación fallida", async () => {
  for (const [code, expected] of [
    ["40001", "conflict"],
    ["55000", "edit_locked"],
    ["42501", "forbidden"],
    ["22023", "invalid_input"],
    ["P0002", "not_found"],
    ["unknown", "unavailable"],
  ]) {
    mocks.correct.mockRejectedValue({ code, message: "private SQL connection credentials" });
    mocks.remove.mockRejectedValue({ code, message: "private SQL connection credentials" });
    for (const result of [
      await correctWorkoutAction(workoutCorrectionFixture()),
      await removeWorkoutAction(workoutRemovalFixture()),
    ]) {
      expect(result).toMatchObject({ ok: false, code: expected });
      expect(JSON.stringify(result)).not.toContain("private SQL");
    }
  }
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("confirmación incompatible no revalida y una confirmación propia actualiza vistas", async () => {
  mocks.remove.mockResolvedValue({ ...workoutRemovalFixture(), revision: 4, status: "deleted" });
  expect(await removeWorkoutAction(workoutRemovalFixture())).toMatchObject({
    ok: false,
    code: "unavailable",
  });
  expect(mocks.revalidate).not.toHaveBeenCalled();
  mocks.remove.mockImplementation(async (_db, input) => ({
    version: 1,
    requestId: input.requestId,
    workoutId: input.workoutId,
    revision: input.expectedRevision + 1,
    status: "duplicate",
  }));
  expect(await removeWorkoutAction(workoutRemovalFixture())).toMatchObject({
    ok: true,
    value: { status: "duplicate" },
  });
  expect(mocks.revalidate).toHaveBeenCalledWith("/history");
  expect(mocks.revalidate).toHaveBeenCalledWith("/week");
});

it("una respuesta incompatible del adaptador es incierta, nunca rechazo de datos del usuario", async () => {
  const malformed = workoutRemovalReceiptSchema.safeParse({});
  if (malformed.success) throw Error("fixture");
  mocks.correct.mockRejectedValue(malformed.error);
  mocks.remove.mockRejectedValue(malformed.error);
  expect(await correctWorkoutAction(workoutCorrectionFixture())).toMatchObject({
    ok: false,
    code: "unavailable",
  });
  expect(await removeWorkoutAction(workoutRemovalFixture())).toMatchObject({
    ok: false,
    code: "unavailable",
  });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
