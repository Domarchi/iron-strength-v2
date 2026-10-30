import { MobileError } from "./client";

export type SyncFailure = { kind: "connection" | "local"; message: string };

/** Automatic connection probes must not diagnose a verified queue as damaged. */
export function syncFailure(
  previous: SyncFailure | null,
  kind: SyncFailure["kind"],
  error: unknown,
): SyncFailure | null {
  if (kind === "connection" && previous?.kind === "local") return previous;
  if (
    kind === "connection" &&
    error instanceof MobileError &&
    ((error.code === "network" && error.status === 0) || error.status >= 500)
  )
    return null;
  return {
    kind,
    message:
      error instanceof Error
        ? error.message
        : kind === "connection"
          ? "No pudimos volver a conectar. Tus registros se conservan."
          : "No pudimos confirmar la sincronización.",
  };
}

export function syncIssue(input: {
  failure: SyncFailure | null;
  queueError: string | null;
  blocked: boolean;
  localError: string | null;
}): { message: string; repairLocal: boolean } | null {
  const localMessage =
    input.localError ??
    input.queueError ??
    (input.blocked ? "Comprueba la cola local. Conservamos los datos guardados." : null);
  if (localMessage) return { message: localMessage, repairLocal: true };
  return input.failure
    ? { message: input.failure.message, repairLocal: input.failure.kind === "local" }
    : null;
}
