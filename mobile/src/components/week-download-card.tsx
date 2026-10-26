import { Icon } from "./icon";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useWeekDownload } from "../lib/week-context";
import { Action, Notice, day, s, usePalette } from "./ui";
const dateFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Santiago",
});
function RemoveDownload() {
  const [open, setOpen] = useState(false),
    { controller, download } = useWeekDownload();
  return open ? (
    <>
      <Notice message="Se elimina solo la copia de la rutina. Tus entrenamientos iniciados y guardados se conservan." />
      <Action
        label="Confirmar eliminación de descarga"
        secondary
        disabled={download.busy}
        onPress={() => {
          void controller.remove().catch(() => {});
        }}
      />
      <Action
        label="Conservar descarga"
        quiet
        disabled={download.busy}
        onPress={() => setOpen(false)}
      />
    </>
  ) : (
    <Action
      label="Eliminar descarga"
      quiet
      disabled={download.busy}
      onPress={() => setOpen(true)}
    />
  );
}
export function WeekDownloadCard({
  expected,
}: {
  expected?: { programId: string; weekStart: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const p = usePalette(),
    { controller, download } = useWeekDownload(),
    pack = download.verified ? download.pack : null;
  if (!expected && download.ready && download.verified && !pack) return null;
  const same = pack?.program.id === expected?.programId && pack?.weekStart === expected?.weekStart;
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
        Semana sin conexión
      </Text>
      <Text style={[s.caption, { color: p.muted }]}>
        {download.busy
          ? "Comprobando la descarga…"
          : !download.ready
            ? "Comprobando los datos guardados…"
            : pack
              ? `Descarga guardada: ${dateFormat.format(new Date(pack.downloadedAt))}`
              : download.verified
                ? "Todavía no has descargado esta semana."
                : "Descarga sin verificar."}
      </Text>
      {pack && expected && !same ? (
        <Text style={[s.body, { color: p.muted }]}>
          Esta copia corresponde a otra semana. Descarga la vigente antes de entrenar.
        </Text>
      ) : null}
      {download.error ? <Notice message={download.error} /> : null}
      {download.blocked ? (
        <Action
          label="Comprobar descarga"
          secondary
          disabled={download.busy}
          onPress={() => {
            void controller.restore();
          }}
        />
      ) : null}
      {expected ? (
        <Action
          label={same ? "Actualizar descarga" : "Descargar semana"}
          secondary
          disabled={!download.ready || download.busy || download.blocked}
          onPress={() => {
            void controller.download(expected).catch(() => {});
          }}
        />
      ) : null}
      {pack ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Detalles de descarga"
            accessibilityState={{ expanded }}
            aria-expanded={expanded}
            onPress={() => setExpanded((value) => !value)}
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
              <Text style={[s.body, { color: p.ink }]}>
                {pack.program.name} · {day(pack.weekStart)} — {day(pack.weekEnd)}
              </Text>
              <Text style={[s.caption, { color: p.muted }]}>
                {pack.sessions.length} {pack.sessions.length === 1 ? "sesión" : "sesiones"} ·{" "}
                {pack.sessions.reduce((n, r) => n + r.context.exercises.length, 0)} ejercicios
              </Text>
              <Text style={[s.caption, { color: p.muted }]}>
                Rutinas, alternativas e historial reciente. Inicia sesiones solo durante su semana
                vigente.
              </Text>
              <RemoveDownload key={pack.program.id + pack.weekStart + pack.downloadedAt} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
