import { useWeekDownload } from "../lib/week-context";
import { Icon } from "./icon";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSession } from "../lib/session";
import { useTrainingDownload } from "../lib/training-download-context";
import { downloadedAt } from "../lib/offline-week";
import { Action, Notice, s, usePalette } from "./ui";
export function TrainingDownloadCard({
  expected,
  compact = false,
}: {
  expected?: { programId: string; weekStart: string };
  compact?: boolean;
}) {
  const p = usePalette(),
    { state } = useSession(),
    { controller, download, bundle, owns } = useTrainingDownload(),
    { controller: previousController, download: previous } = useWeekDownload();
  const [expanded, setExpanded] = useState(false),
    [remove, setRemove] = useState(false),
    [removePrevious, setRemovePrevious] = useState(false);
  const offline = state.status !== "authenticated" || state.mode === "offline";
  const disabled = !owns || !download.ready || download.busy || download.reserved || previous.busy;
  const old = owns && previous.verified ? previous.pack : null;
  const mismatch =
    bundle &&
    expected &&
    (bundle.week?.program.id !== expected.programId ||
      bundle.week?.weekStart !== expected.weekStart);
  const summary = download.busy
    ? "Comprobando la descarga…"
    : !download.ready
      ? "Recuperando descarga…"
      : bundle
        ? `Disponible sin conexión · ${downloadedAt(bundle.downloadedAt)}`
        : old
          ? `Copia anterior · ${downloadedAt(old.downloadedAt)}`
          : compact
            ? "Descargar esta semana"
            : "Descarga tus entrenamientos para usarlos sin Internet.";
  const actionLabel = bundle ? "Actualizar entrenamientos descargados" : "Descargar entrenamientos";
  return (
    <View
      testID="training-download-card"
      style={[
        compact ? { gap: 12 } : s.card,
        { backgroundColor: compact ? "transparent" : p.card, borderColor: p.border },
      ]}
    >
      {compact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint={summary}
          accessibilityState={{
            disabled: disabled || offline || download.blocked,
            busy: download.busy,
          }}
          disabled={disabled || offline || download.blocked}
          onPress={() => {
            void controller.download();
          }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            minHeight: 64,
            paddingVertical: 12,
            borderRadius: 10,
            backgroundColor: pressed ? p.raised : "transparent",
          })}
        >
          <Icon name="download" size={22} color={p.muted} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.label, { color: p.ink }]}>Entrenar sin conexión</Text>
            <Text style={[s.caption, { color: p.muted }]}>{summary}</Text>
          </View>
          <Icon name="arrow" size={18} color={p.muted} />
        </Pressable>
      ) : (
        <>
          <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
            Entrenar sin conexión
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>{summary}</Text>
        </>
      )}
      {mismatch ? (
        <Text style={[s.caption, { color: p.muted }]}>
          La copia tiene otra semana o programa. Actualiza para traer tu planificación vigente.
        </Text>
      ) : null}
      {previous.error && !previous.verified ? (
        <Notice message={previous.error ?? "Hay una copia anterior sin verificar. Se conserva."} />
      ) : null}
      {download.error ? <Notice message={download.error.message} /> : null}
      {!compact ? (
        <Action
          label={bundle ? "Actualizar" : "Descargar"}
          accessibilityLabel={
            bundle ? "Actualizar entrenamientos descargados" : "Descargar entrenamientos"
          }
          secondary
          disabled={disabled || offline || download.blocked}
          onPress={() => {
            void controller.download();
          }}
        />
      ) : null}
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
      {bundle || old || previous.error ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Detalles de entrenamientos descargados"
            accessibilityState={{ expanded }}
            aria-expanded={expanded}
            onPress={() => {
              setExpanded((v) => !v);
              setRemove(false);
              setRemovePrevious(false);
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderRadius: 8,
              backgroundColor: pressed ? p.raised : "transparent",
            })}
          >
            <Text style={[s.caption, { color: p.ink }]}>Detalles de descarga</Text>
            <Icon name={expanded ? "minus" : "plus"} size={16} color={p.muted} />
          </Pressable>
          {expanded ? (
            <View style={{ gap: 10 }}>
              {bundle ? (
                <>
                  <Text style={[s.caption, { color: p.muted }]}>
                    {bundle.catalog.exercises.length} ejercicios · {bundle.library.routines.length}{" "}
                    rutinas personales · {bundle.week?.sessions.length ?? 0} sesiones asignadas
                  </Text>
                  <Text style={[s.caption, { color: p.muted }]}>
                    Incluye alternativas e historial reciente. Las sesiones asignadas se inician
                    durante su semana.
                  </Text>
                  {remove ? (
                    <>
                      <Text style={[s.caption, { color: p.muted }]}>
                        Los registros iniciados y pendientes de envío se conservan.
                      </Text>
                      <Action
                        label="Confirmar eliminación"
                        danger
                        accessibilityLabel="Confirmar eliminación de entrenamientos descargados"
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
                        label="Conservar"
                        accessibilityLabel="Conservar entrenamientos descargados"
                        quiet
                        disabled={disabled}
                        onPress={() => setRemove(false)}
                      />
                    </>
                  ) : (
                    <Action
                      label="Eliminar descarga"
                      danger
                      accessibilityLabel="Eliminar entrenamientos descargados"
                      quiet
                      disabled={disabled}
                      onPress={() => setRemove(true)}
                    />
                  )}
                </>
              ) : null}
              {old ? (
                <View style={{ gap: 10 }}>
                  <Text style={[s.label, { color: p.ink }]}>Copia anterior de semana</Text>
                  <Text style={[s.caption, { color: p.muted }]}>
                    {old.program.name} · {downloadedAt(old.downloadedAt)}. Conserva su formato
                    original; puedes consultarla sin conexión.
                  </Text>
                  {previous.error ? <Notice message={previous.error} /> : null}
                  {removePrevious ? (
                    <>
                      <Text style={[s.caption, { color: p.muted }]}>
                        Se retira solo esta copia anterior. Los entrenamientos y la descarga
                        completa se conservan.
                      </Text>
                      <Action
                        label="Confirmar eliminación de copia anterior"
                        danger
                        quiet
                        disabled={disabled}
                        onPress={() => {
                          void previousController
                            .remove()
                            .then(() => setRemovePrevious(false))
                            .catch(() => {});
                        }}
                      />
                      <Action
                        label="Conservar copia anterior"
                        quiet
                        disabled={disabled}
                        onPress={() => setRemovePrevious(false)}
                      />
                    </>
                  ) : (
                    <Action
                      label="Eliminar copia anterior"
                      danger
                      quiet
                      disabled={disabled}
                      onPress={() => setRemovePrevious(true)}
                    />
                  )}
                </View>
              ) : null}
              {previous.error && !previous.verified ? (
                <Action
                  label="Comprobar copia anterior"
                  quiet
                  disabled={disabled}
                  onPress={() => {
                    void previousController.restore();
                  }}
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
