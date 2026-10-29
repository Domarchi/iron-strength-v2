import { StatusMessage } from "@/components/ui/status-message";
import { TrainingHistoryReadError } from "@/lib/data/training-history";
export function ProgressReadFailure({ error, retryHref }: { error: unknown; retryHref: string }) {
  const code = error instanceof TrainingHistoryReadError ? error.code : "unavailable";
  const message =
    code === "capacity"
      ? "El historial supera el límite de esta versión. No mostramos un progreso parcial."
      : code === "incompatible"
        ? "El historial requiere una versión compatible de la app."
        : code === "unauthorized"
          ? "Vuelve a iniciar sesión para consultar tus registros."
          : "Tus registros siguen guardados. Vuelve a intentarlo.";
  return (
    <div className="space-y-3">
      <StatusMessage error>No pudimos cargar el progreso. {message}</StatusMessage>
      <a
        href={code === "unauthorized" ? "/login" : retryHref}
        className="inline-flex min-h-11 min-w-11 items-center rounded-lg border px-4 text-sm font-medium"
      >
        {code === "unauthorized" ? "Ir al acceso" : "Reintentar"}
      </a>
    </div>
  );
}
