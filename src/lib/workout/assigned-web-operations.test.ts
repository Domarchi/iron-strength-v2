import { expect, it, vi } from "vitest";
import { assignedId as id, assignedTrainingFixture } from "@/test/fixtures/assigned-training";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import type { TypedRecordingPayload } from "../mobile/typed-recording-contracts";
import { createAssignedWebOperations } from "./assigned-web-operations";

function setup() {
  const context = assignedTrainingFixture();
  const read = vi.fn(async () => ({ ok: true as const, context, canStart: true }));
  const payload = typedRecordingFixture("assigned");
  const save = vi.fn(async (input: TypedRecordingPayload) => ({
    status: "created",
    workoutId: input.id,
  }));
  const authorize = vi.fn(async () => ({ userId: context.userId, read, save }));
  const operations = createAssignedWebOperations({ authorize });
  return { context, payload, read, save, authorize, operations };
}
it("consultar valida cuenta y sesión sin crear registro ni guardar", async () => {
  const x = setup();
  expect(await x.operations.read({ version: 1, userId: id(1), sessionId: id(3) })).toEqual({
    ok: true,
    value: x.context,
  });
  expect(x.read).toHaveBeenCalledWith(id(3));
  expect(x.save).not.toHaveBeenCalled();
});
it("una cuenta capturada distinta o expirada no consulta ni envía", async () => {
  const x = setup();
  expect(await x.operations.read({ version: 1, userId: id(90), sessionId: id(3) })).toMatchObject({
    ok: false,
    code: "account_changed",
  });
  expect(await x.operations.save({ version: 1, userId: id(90), payload: x.payload })).toMatchObject(
    { ok: false, code: "account_changed" },
  );
  expect(x.read).not.toHaveBeenCalled();
  expect(x.save).not.toHaveBeenCalled();
  const expired = createAssignedWebOperations({ authorize: async () => null });
  expect(await expired.save({ version: 1, userId: id(1), payload: x.payload })).toMatchObject({
    ok: false,
    code: "unauthorized",
  });
});
it("rechaza parámetros de recuperación, alumno extra y formatos de cierre anteriores", async () => {
  const x = setup();
  for (const extra of [{ allowRecovery: true }, { studentId: id(90) }, { today: "2026-10-26" }])
    expect(
      await x.operations.read({ version: 1, userId: id(1), sessionId: id(3), ...extra }),
    ).toMatchObject({ ok: false, code: "invalid_input" });
  for (const payload of [typedRecordingFixture("free"), { ...x.payload, version: 2 }])
    expect(await x.operations.save({ version: 1, userId: id(1), payload })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  expect(x.read).not.toHaveBeenCalled();
  expect(x.save).not.toHaveBeenCalled();
});
it("un contexto ajeno, de otra sesión o de formato anterior nunca permite iniciar", async () => {
  for (const changed of [
    { userId: id(90) },
    { origin: { kind: "assigned", programId: id(2), programSessionId: id(90) } },
    { version: 4 },
  ]) {
    const x = setup();
    x.read.mockResolvedValueOnce({
      ok: true,
      canStart: true,
      context: { ...x.context, ...changed },
    } as never);
    expect(await x.operations.read({ version: 1, userId: id(1), sessionId: id(3) })).toMatchObject({
      ok: false,
      code: "unavailable",
    });
  }
});
it("un inicio no vigente se rechaza aunque el lector conserve contexto recuperable", async () => {
  const x = setup();
  x.read.mockResolvedValueOnce({ ok: true, canStart: false, context: x.context });
  expect(await x.operations.read({ version: 1, userId: id(1), sessionId: id(3) })).toMatchObject({
    ok: false,
    code: "not_current_week",
  });
  x.read.mockResolvedValueOnce({ ok: false, reason: "not_found" } as never);
  expect(await x.operations.read({ version: 1, userId: id(1), sessionId: id(3) })).toMatchObject({
    ok: false,
    code: "not_found",
  });
});
it("envía el documento completo e identifica created y duplicate por el mismo ID", async () => {
  const x = setup(),
    input = { version: 1, userId: id(1), payload: x.payload };
  expect(await x.operations.save(input)).toEqual({
    ok: true,
    value: { version: 3, ok: true, status: "created", workoutId: x.payload.id },
  });
  x.save.mockResolvedValueOnce({ status: "duplicate", workoutId: x.payload.id });
  expect(await x.operations.save(input)).toMatchObject({
    ok: true,
    value: { status: "duplicate" },
  });
  expect(x.save.mock.calls).toEqual([[x.payload], [x.payload]]);
});
it("un recibo eliminado, ajeno o con campos extra no acredita guardado", async () => {
  for (const receipt of [
    { status: "removed", workoutId: typedRecordingFixture("assigned").id },
    { status: "created", workoutId: id(90) },
    { status: "created", workoutId: typedRecordingFixture("assigned").id, secret: "private" },
  ]) {
    const x = setup();
    x.save.mockResolvedValueOnce(receipt);
    expect(
      await x.operations.save({ version: 1, userId: id(1), payload: x.payload }),
    ).toMatchObject({ ok: false, code: receipt.status === "removed" ? "removed" : "unavailable" });
  }
});
it("clasifica errores sin devolver detalles internos y conserva la misma petición al reintentar", async () => {
  const x = setup(),
    input = { version: 1, userId: id(1), payload: x.payload };
  for (const [sql, code] of [
    ["40001", "conflict"],
    ["23505", "conflict"],
    ["42501", "forbidden"],
    ["P0002", "not_found"],
    ["23514", "invalid_input"],
    ["08006", "unavailable"],
  ]) {
    x.save.mockRejectedValueOnce(Object.assign(Error("internal-secret"), { code: sql }));
    const result = await x.operations.save(input);
    expect(result).toMatchObject({ ok: false, code });
    expect(JSON.stringify(result)).not.toContain("internal-secret");
  }
  expect(await x.operations.save(input)).toMatchObject({ ok: true });
  expect(x.save.mock.calls.every(([p]) => JSON.stringify(p) === JSON.stringify(x.payload))).toBe(
    true,
  );
});
it("rechaza el tamaño total antes de validar o enviar, incluidos campos ajenos", async () => {
  const x = setup();
  expect(
    await x.operations.save({
      version: 1,
      userId: id(1),
      payload: x.payload,
      extra: "😀".repeat(70000),
    }),
  ).toMatchObject({ ok: false, code: "invalid_input" });
  expect(x.save).not.toHaveBeenCalled();
});
