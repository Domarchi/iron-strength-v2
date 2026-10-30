import { expect, it } from "vitest";
import { MobileError } from "./client";
import { syncFailure, syncIssue, type SyncFailure } from "./sync-failure";

it.each([
  new MobileError("network", "Sin transporte"),
  new MobileError("unavailable", "Servicio temporalmente no disponible", 503),
])("una reconexión transitoria no anuncia daños en la cola: %s", (error) => {
  expect(syncFailure(null, "connection", error)).toBeNull();
  expect(
    syncIssue({ failure: null, queueError: null, blocked: false, localError: null }),
  ).toBeNull();
});
it.each([
  new MobileError("unauthorized", "Vuelve a entrar", 401),
  new MobileError("network", "Credencial rechazada", 401),
  new MobileError("forbidden", "Cuenta inactiva", 403),
  new MobileError("rate_limited", "Espera antes de reintentar", 429),
  new MobileError("storage", "No pudimos guardar la credencial"),
  new Error("Formato desconocido"),
])("conserva los fallos de acceso sin ofrecer reparación de cola: %s", (error) => {
  const failure = syncFailure(null, "connection", error);
  expect(failure).toEqual({ kind: "connection", message: error.message });
  expect(syncIssue({ failure, queueError: null, blocked: false, localError: null })).toEqual({
    message: error.message,
    repairLocal: false,
  });
});
it("un problema local conserva su explicación aunque falle la reconexión", () => {
  const previous: SyncFailure = { kind: "local", message: "No se confirmó la escritura" };
  expect(syncFailure(previous, "connection", new MobileError("network", "Sin red"))).toBe(previous);
  expect(syncFailure(previous, "connection", new Error("Credencial no disponible"))).toBe(previous);
  const failure = syncFailure(null, "local", new MobileError("network", "Lectura incompleta"));
  expect(failure).toEqual({ kind: "local", message: "Lectura incompleta" });
  expect(
    syncIssue({ failure, queueError: null, blocked: false, localError: null })?.repairLocal,
  ).toBe(true);
});
it.each([
  { queueError: "Sin espacio", blocked: false, localError: null, message: "Sin espacio" },
  {
    queueError: null,
    blocked: true,
    localError: null,
    message: "Comprueba la cola local. Conservamos los datos guardados.",
  },
  {
    queueError: null,
    blocked: false,
    localError: "Falló la relectura",
    message: "Falló la relectura",
  },
])("un error real del almacén prevalece sobre conexión: %j", ({ message, ...input }) => {
  expect(
    syncIssue({ ...input, failure: { kind: "connection", message: "No pudimos renovar" } }),
  ).toEqual({ message, repairLocal: true });
});
