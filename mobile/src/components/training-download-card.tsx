import { useState } from "react";
import { Text, View } from "react-native";
import { useSession } from "../lib/session";
import { useTrainingDownload } from "../lib/training-download-context";
import { downloadedAt } from "../lib/offline-week";
import { Action, Notice, s, usePalette } from "./ui";
export function TrainingDownloadCard() {
  const p = usePalette(),
    { state } = useSession(),
    { controller, download, bundle, owns } = useTrainingDownload();
  const [expanded, setExpanded] = useState(false),
    [remove, setRemove] = useState(false);
  const offline = state.status !== "authenticated" || state.mode === "offline";
  const disabled = !owns || !download.ready || download.busy || download.reserved;
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
        Sin conexión
      </Text>
      <Text style={[s.caption, { color: p.muted }]}>
        {download.busy
          ? "Comprobando la descarga…"
          : !download.ready
            ? "Recuperando descarga…"
            : bundle
              ? `Disponible sin conexión · ${downloadedAt(bundle.downloadedAt)}`
              : "Descarga tus entrenamientos para usarlos sin Internet."}
      </Text>
      {download.error ? <Notice message={download.error.message} /> : null}
      <Action
        label={bundle ? "Actualizar entrenamientos descargados" : "Descargar entrenamientos"}
        secondary
        disabled={disabled || offline || download.blocked}
        onPress={() => {
          void controller.download();
        }}
      />
      {download.blocked || (!download.verified && download.ready) ? (
        <Action
          label="Comprobar entrenamientos descargados"
          secondary
          disabled={disabled}
          onPress={() => {
            void controller.restore();
          }}
        />
      ) : null}
      {bundle ? (
        <>
          <Action
            label="Detalles de entrenamientos descargados"
            quiet
            onPress={() => {
              setExpanded((v) => !v);
              setRemove(false);
            }}
          />
          {expanded ? (
            <View style={{ gap: 10 }}>
              <Text style={[s.caption, { color: p.muted }]}>
                {bundle.catalog.exercises.length} ejercicios · {bundle.library.routines.length}{" "}
                rutinas personales · {bundle.week?.sessions.length ?? 0} sesiones asignadas
              </Text>
              <Text style={[s.caption, { color: p.muted }]}>
                Incluye alternativas e historial reciente. Las sesiones asignadas se inician durante
                su semana.
              </Text>
              {remove ? (
                <>
                  <Text style={[s.caption, { color: p.muted }]}>
                    Los registros iniciados y pendientes de envío se conservan.
                  </Text>
                  <Action
                    label="Confirmar eliminación de entrenamientos descargados"
                    secondary
                    disabled={disabled}
                    onPress={() => {
                      void controller.remove().then((ok) => {
                        if (ok) {
                          setRemove(false);
                          setExpanded(false);
                        }
                      });
                    }}
                  />
                  <Action
                    label="Conservar entrenamientos descargados"
                    quiet
                    disabled={disabled}
                    onPress={() => setRemove(false)}
                  />
                </>
              ) : (
                <Action
                  label="Eliminar entrenamientos descargados"
                  quiet
                  disabled={disabled}
                  onPress={() => setRemove(true)}
                />
              )}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
