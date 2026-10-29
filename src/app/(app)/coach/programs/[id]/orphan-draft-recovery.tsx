"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createCoachEditorBrowserStorage } from "@/lib/coach/editor-browser";
import {
  CoachOrphanEditorRecovery,
  listOrphanCoachEditorEntries,
  type OrphanCoachDraft,
} from "@/lib/coach/orphan-editor-recovery";
import {
  mutateCanonicalSessionAction,
  reconcileLegacySessionAction,
} from "../canonical-editor-actions";
const subscribe = () => () => {};
export function OrphanDraftRecovery(props: {
  userId: string;
  programId: string;
  sessionIds: string[];
}) {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return ready ? (
    <RecoveryList
      key={`${props.userId}:${props.programId}:${[...props.sessionIds].sort().join(":")}`}
      {...props}
    />
  ) : null;
}
function RecoveryList({
  userId,
  programId,
  sessionIds,
}: {
  userId: string;
  programId: string;
  sessionIds: string[];
}) {
  const [discovered, setDiscovered] = useState(() =>
    listOrphanCoachEditorEntries(userId, programId, sessionIds),
  );
  const missing = discovered.entries.filter((entry) => !sessionIds.includes(entry.scope.sessionId));
  if (discovered.ok && !missing.length) return null;
  return (
    <section
      aria-label="Borradores de sesiones no disponibles"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <h2 className="text-sm font-semibold">Borradores por recuperar</h2>
      <p className="text-sm text-muted-foreground">
        Estas sesiones ya no están disponibles. Puedes conservar su propuesta y comprobar los
        intentos pendientes.
      </p>
      {!discovered.ok ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>No se pudo revisar todo el almacenamiento. No se ha retirado ningún borrador.</p>
          <Button
            variant="outline"
            onClick={() =>
              setDiscovered(listOrphanCoachEditorEntries(userId, programId, sessionIds))
            }
          >
            Revisar borradores locales
          </Button>
        </div>
      ) : null}
      {missing.map((entry, index) => (
        <RecoveryItem key={entry.key} source={entry} index={index + 1} />
      ))}
    </section>
  );
}
function RecoveryItem({ source, index }: { source: OrphanCoachDraft; index: number }) {
  const [controller] = useState(
    () =>
      new CoachOrphanEditorRecovery(source, {
        storage: createCoachEditorBrowserStorage(source.scope),
        mutate: mutateCanonicalSessionAction,
        legacy: reconcileLegacySessionAction,
      }),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const router = useRouter();
  const [exportError, setExportError] = useState<string | null>(null);
  const names = {
    canonical: "operación pendiente",
    save: "guardado anterior",
    order: "orden anterior",
    copy: "copia anterior",
    layout: "grupo anterior",
    alternatives: "alternativas anteriores",
    add: "agregado anterior",
  };
  if (state.removed)
    return (
      <p role="status" className="text-sm">
        Borrador retirado de este dispositivo.
      </p>
    );
  return (
    <article
      aria-label={`Borrador no disponible ${index}`}
      className="space-y-2 rounded-lg border p-3"
    >
      <p className="text-sm font-medium">Borrador {index}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={state.busy}
          onClick={() => {
            try {
              const url = URL.createObjectURL(new Blob([source.raw], { type: "application/json" }));
              const link = document.createElement("a");
              link.href = url;
              link.download = `iron-strength-borrador-${index}.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 0);
              setExportError(null);
            } catch {
              setExportError(
                "No se pudo descargar el archivo. El original sigue en este dispositivo.",
              );
            }
          }}
        >
          Descargar borrador
        </Button>
        {controller.operations.map((operation) => (
          <Button
            key={operation}
            disabled={state.busy}
            onClick={() => void controller.verify(operation)}
          >
            Verificar {names[operation]}
          </Button>
        ))}
      </div>
      {controller.entry.kind === "unknown" ? (
        <p className="text-sm text-muted-foreground">
          El formato no es compatible. Se conserva completo.
        </p>
      ) : null}
      {state.error || exportError ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error ?? exportError}
        </p>
      ) : null}
      {state.confirmed ? (
        <div className="space-y-2">
          <p role="status" className="text-sm">
            Operación confirmada por el servidor. La sesión de origen no está disponible.
          </p>
          <p className="text-xs text-muted-foreground">
            El documento completo sigue aquí. Descárgalo antes de retirarlo si quieres conservar
            otras propuestas.
          </p>
          <Button
            variant="outline"
            disabled={state.busy}
            onClick={() => {
              if (
                window.confirm(
                  "¿Retirar este borrador completo del dispositivo? También se retirarán las propuestas locales que contiene.",
                )
              )
                void controller.remove(true).then((removed) => {
                  if (removed) router.refresh();
                });
            }}
          >
            Retirar borrador confirmado
          </Button>
        </div>
      ) : null}
    </article>
  );
}
