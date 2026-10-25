import { useState } from "react";
import { Text, View } from "react-native";
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
  const p = usePalette(),
    { controller, download } = useWeekDownload(),
    pack = download.verified ? download.pack : null;
  if (!expected && download.ready && download.verified && !pack) return null;
  const same = pack?.program.id === expected?.programId && pack?.weekStart === expected?.weekStart;
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
        Tu semana en este dispositivo
      </Text>
      <Text style={[s.body, { color: p.muted }]}>
        Guarda rutinas, alternativas e historial reciente.
      </Text>
      <Text style={[s.label, { color: p.ink }]}>
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
      {pack ? (
        <>
          <Text style={[s.body, { color: p.ink }]}>
            {pack.program.name} · {day(pack.weekStart)} — {day(pack.weekEnd)}
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>
            {pack.sessions.length} {pack.sessions.length === 1 ? "sesión" : "sesiones"} ·{" "}
            {pack.sessions.reduce((n, r) => n + r.context.exercises.length, 0)} ejercicios
          </Text>
          {expected && !same ? (
            <Text style={[s.body, { color: p.muted }]}>
              Esta copia corresponde a otra semana. Descarga la vigente antes de entrenar.
            </Text>
          ) : null}
        </>
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
      {pack ? <RemoveDownload key={pack.program.id + pack.weekStart + pack.downloadedAt} /> : null}
      <Text style={[s.caption, { color: p.muted }]}>
        Esta copia conserva rutinas e historial reciente. Solo puedes empezar rutinas de su semana
        vigente.
      </Text>
    </View>
  );
}
