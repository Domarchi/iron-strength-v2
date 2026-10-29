import { useState } from "react";
import { Text, View } from "react-native";
import { useLibraryDrafts } from "../lib/library-context";
import { useSession } from "../lib/session";
import { Action, Notice, s, usePalette } from "./ui";
export function LibraryAttempt({
  allowDiscard = false,
  onConfirmed,
}: {
  allowDiscard?: boolean;
  onConfirmed?: () => void;
}) {
  const p = usePalette(),
    { controller, library } = useLibraryDrafts(),
    { state } = useSession();
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState<string | null>(null);
  const offline = state.status === "authenticated" && state.mode === "offline";
  if (!library.error && !library.pending && !library.dirty) return null;
  return (
    <View style={{ gap: 10 }}>
      {library.error ? (
        <Notice
          message={library.error}
          retry={
            library.blocked
              ? () => {
                  void controller.restore();
                }
              : library.dirty
                ? () => {
                    void controller.retryStorage().catch(() => {});
                  }
                : undefined
          }
        />
      ) : null}
      {error && error !== library.error ? <Notice message={error} /> : null}
      {library.pending ? (
        <>
          {!library.error ? (
            <Text style={[s.body, { color: p.ink }]}>
              {library.issue
                ? "Revisa los cambios antes de continuar."
                : "El guardado aún no está confirmado."}
            </Text>
          ) : null}
          {!library.issue ? (
            <Action
              label="Reintentar guardado de rutina"
              disabled={offline || library.busy || library.blocked}
              busy={library.busy}
              onPress={() => {
                void controller
                  .retryPending()
                  .then(onConfirmed)
                  .catch((e) => setError(e.message));
              }}
            />
          ) : null}
          {allowDiscard ? (
            confirm ? (
              <>
                <Text style={[s.caption, { color: p.muted }]}>
                  Se descartará el intento de este dispositivo. Si ya se guardó en el servidor,
                  seguirá en tu biblioteca.
                </Text>
                <Action
                  label="Confirmar descarte del intento"
                  secondary
                  disabled={library.busy}
                  onPress={() => {
                    void controller
                      .discardPending(true)
                      .then(() => {
                        setConfirm(false);
                        onConfirmed?.();
                      })
                      .catch((e) => setError(e.message));
                  }}
                />
                <Action
                  label="Cancelar descarte del intento"
                  quiet
                  onPress={() => setConfirm(false)}
                />
              </>
            ) : (
              <Action
                label="Descartar intento pendiente"
                quiet
                disabled={library.busy}
                onPress={() => setConfirm(true)}
              />
            )
          ) : null}
        </>
      ) : library.dirty ? (
        <Text style={[s.caption, { color: p.muted }]}>
          Cambios pendientes de guardar en este dispositivo.
        </Text>
      ) : null}
    </View>
  );
}
