"use client";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  programCopySchema,
  readProgramCopy,
  saveProgramCopy,
  clearProgramCopy,
  type ProgramCopyDraft,
} from "@/lib/coach/program-copy-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { duplicateProgramAction } from "./actions";
const subscribe = () => () => {};
export function DuplicateProgramForm(props: { userId: string; programId: string; name: string }) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return mounted ? <CopyForm {...props} /> : null;
}
function CopyForm({
  userId,
  programId,
  name,
}: {
  userId: string;
  programId: string;
  name: string;
}) {
  const pointerKey = `is:program-copy-tab:${userId}:${programId}`;
  const [request, setRequest] = useState<ProgramCopyDraft | null>(() => {
    try {
      return readProgramCopy(localStorage, userId, programId, sessionStorage.getItem(pointerKey));
    } catch {
      return null;
    }
  });
  const [copyName, setCopyName] = useState(request?.name ?? `Copia de ${name}`.slice(0, 100));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function submit() {
    const next = request ?? {
      version: 1 as const,
      copyId: crypto.randomUUID(),
      name: copyName.trim(),
      updatedAt: new Date().toISOString(),
    };
    if (!programCopySchema.safeParse(next).success) {
      setError("Escribe un nombre de hasta 100 caracteres.");
      return;
    }
    try {
      saveProgramCopy(localStorage, userId, programId, next);
      sessionStorage.setItem(pointerKey, next.copyId);
    } catch {
      setError(
        "No se pudo guardar la petición en este dispositivo. Libera espacio y reintenta para poder recuperar la copia si se corta la conexión.",
      );
      return;
    }
    setRequest(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await duplicateProgramAction({
          sourceId: programId,
          copyId: next.copyId,
          name: next.name,
        });
        if (result.ok) {
          try {
            clearProgramCopy(localStorage, userId, programId, next.copyId);
            if (sessionStorage.getItem(pointerKey) === next.copyId)
              sessionStorage.removeItem(pointerKey);
          } catch {
            /* El recibo permite confirmar la misma copia. */
          }
          router.push(`/coach/programs/${result.id}`);
          router.refresh();
          return;
        }
        setError(result.error);
        if (!result.uncertain) {
          try {
            clearProgramCopy(localStorage, userId, programId, next.copyId);
            if (sessionStorage.getItem(pointerKey) === next.copyId)
              sessionStorage.removeItem(pointerKey);
          } catch {
            /* Conserva el reintento anterior. */
          }
          setRequest(null);
        }
      } catch {
        setError("No recibimos confirmación. Reintenta: se confirmará la misma copia.");
      }
    });
  }
  return (
    <details className="rounded-lg border bg-card p-4" open={request !== null || error !== null}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
        Duplicar programa
      </summary>
      <p className="mb-3 text-sm text-muted-foreground">
        Crea una plantilla independiente con todas las semanas, grupos y alternativas. No incluye
        entrenamientos ni asignaciones.
      </p>
      <label className="block text-sm font-medium">
        Nombre de la copia
        <Input
          value={copyName}
          onChange={(e) => setCopyName(e.target.value)}
          maxLength={100}
          disabled={pending || !!request}
        />
      </label>
      {request ? (
        <p role="status" className="mt-2 text-sm">
          Petición guardada en este dispositivo. Puedes confirmar la misma copia tras recargar.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button className="mt-3" disabled={pending} onClick={submit}>
        {pending ? "Copiando…" : request ? "Confirmar copia" : "Crear copia"}
      </Button>
    </details>
  );
}
