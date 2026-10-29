import { StatusMessage } from "@/components/ui/status-message";
import { ConstancyReadError } from "@/lib/data/constancy-source";

export function ConstancyReadFailure({ error, retryHref }: { error: unknown; retryHref: string }) {
  const known = error instanceof ConstancyReadError ? error : new ConstancyReadError("unavailable");
  return (
    <div className="space-y-2">
      <StatusMessage error>{known.message}</StatusMessage>
      <a
        href={known.code === "unauthorized" ? "/login" : retryHref}
        className="inline-flex min-h-11 min-w-11 items-center rounded-lg border px-4 text-sm font-medium"
      >
        {known.code === "unauthorized" ? "Ir al acceso" : "Reintentar constancia"}
      </a>
    </div>
  );
}
