import { useState, type PropsWithChildren } from "react";
import { Text, TextInput } from "react-native";
import { Action, Brand, Loading, Notice, Page, ScreenIntro, s, usePalette } from "./ui";
import { useAccountRemoval } from "../lib/account-removal-context";
import { useSession } from "../lib/session";
export function AccountRemovalGate({ children }: PropsWithChildren) {
  const { removal } = useAccountRemoval();
  if (!removal.ready) return <Loading />;
  return !removal.blocked && !removal.record ? children : <RemovalRecovery />;
}
function RemovalRecovery() {
  const { controller, removal } = useAccountRemoval(),
    p = usePalette(),
    { client, state } = useSession();
  const [confirmation, setConfirmation] = useState("");
  const confirmed = removal.record?.phase === "confirmed";
  return (
    <Page>
      <Brand />
      <ScreenIntro
        eyebrow="CUENTA Y DATOS"
        title={confirmed ? "Completar limpieza" : "Revisar eliminación"}
      />
      {removal.busy ? (
        <Text style={[s.body, { color: p.ink }]}>
          Estamos procesando tu solicitud. Espera antes de cerrar la app.
        </Text>
      ) : null}
      {removal.error ? <Notice message={removal.error} /> : null}
      {state.status === "blocked" ? (
        <>
          <Notice
            message={state.message}
            retry={() => {
              void client.restore();
            }}
          />
          <Action
            label="Salir de este dispositivo para completar limpieza"
            secondary
            onPress={() => {
              void client.logout().catch(() => {});
            }}
          />
        </>
      ) : null}
      {removal.blocked ? (
        <Action
          label="Reintentar comprobación de la limpieza"
          busy={removal.busy}
          onPress={() => {
            void controller.restore();
          }}
        />
      ) : (
        <>
          <Text style={[s.body, { color: p.ink }]}>
            {confirmed
              ? "El servidor confirmó el borrado de tu cuenta. Falta confirmar la limpieza de sus registros en este dispositivo. Reintentar no vuelve a borrar la cuenta remota."
              : "No tenemos confirmación final del servidor. Tus registros locales se conservan. Puedes volver y comprobar tu acceso, o descartarlos de este dispositivo de forma explícita. Descartar aquí no confirma la eliminación de la cuenta remota."}
          </Text>
          {!confirmed ? (
            <>
              <Action
                label="Conservar datos y volver"
                secondary
                busy={removal.busy}
                onPress={() => {
                  void controller.preserve().catch(() => {});
                }}
              />
              <Text style={[s.label, { color: p.ink }]}>
                Para descartar de este teléfono, escribe BORRAR LOCAL
              </Text>
              <TextInput
                accessibilityLabel="Confirmación de borrado local"
                value={confirmation}
                onChangeText={setConfirmation}
                editable={!removal.busy}
                autoComplete="off"
                maxLength={30}
                style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }]}
              />
            </>
          ) : null}
          <Action
            label={
              confirmed ? "Reintentar limpieza local" : "Borrar solo datos locales de esta cuenta"
            }
            busy={removal.busy}
            disabled={
              state.status === "booting" ||
              state.status === "blocked" ||
              (!confirmed && confirmation.trim().toUpperCase() !== "BORRAR LOCAL")
            }
            onPress={() => {
              void controller.finishCleanup(!confirmed).catch(() => {});
            }}
          />
        </>
      )}
    </Page>
  );
}
