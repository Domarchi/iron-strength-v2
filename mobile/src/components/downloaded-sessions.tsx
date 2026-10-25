import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { AppState, Text, View } from "react-native";
import { santiagoDate, addDays } from "../../../src/domain/dates";
import { useWeekDownload } from "../lib/week-context";
import { useSession } from "../lib/session";
import { downloadedAt, downloadedWeekCurrent } from "../lib/offline-week";
import { Action, Notice, day, s, usePalette } from "./ui";
export function DownloadedSessions() {
  const p = usePalette(),
    { state } = useSession(),
    { controller, download } = useWeekDownload(),
    [today, setToday] = useState(() => santiagoDate(new Date()));
  useFocusEffect(
    useCallback(() => {
      const update = () => setToday(santiagoDate(new Date()));
      update();
      const sub = AppState.addEventListener("change", update);
      return () => sub.remove();
    }, []),
  );
  if (state.status !== "authenticated") return null;
  const pack =
    download.verified && download.pack?.userId === state.session.profile.id ? download.pack : null;
  if (!download.ready)
    return <Text style={[s.body, { color: p.muted }]}>Recuperando la semana descargada…</Text>;
  if (!pack)
    return (
      <>
        {download.error && !download.blocked ? <Notice message={download.error} /> : null}
        <Notice
          message={
            download.blocked
              ? (download.error ?? "No pudimos verificar la descarga.")
              : "No hay una semana descargada para esta cuenta."
          }
        />
        {download.blocked ? (
          <Action
            label="Comprobar descarga"
            secondary
            onPress={() => {
              void controller.restore();
            }}
          />
        ) : null}
        <Text style={[s.body, { color: p.muted }]}>
          Conecta para descargar tu semana. Tus registros iniciados se conservan.
        </Text>
      </>
    );
  const current = downloadedWeekCurrent(pack, state.session.profile.id, today);
  return (
    <View style={{ gap: 18 }}>
      {download.error ? <Notice message={download.error} /> : null}
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
          {pack.program.name}
        </Text>
        <Text style={[s.caption, { color: p.muted }]}>
          {day(pack.weekStart)} — {day(pack.weekEnd)} · Guardada el{" "}
          {downloadedAt(pack.downloadedAt)}
        </Text>
        <Text style={[s.body, { color: p.muted }]}>El avance se actualizará al conectar.</Text>
      </View>
      {!current ? (
        <Notice message="Esta copia corresponde a otra semana. Puedes consultarla y retomar un registro ya iniciado; conecta para empezar una rutina de la semana vigente." />
      ) : null}
      {!pack.sessions.length ? (
        <Text style={[s.body, { color: p.muted }]}>
          La semana descargada no tiene sesiones previstas.
        </Text>
      ) : null}
      {pack.sessions.map(({ context, weekday }) => (
        <View key={context.session.id} style={[s.divider, { borderColor: p.border }]}>
          <Text style={[s.subheading, { color: p.ink }]}>
            {context.session.title ?? `Rutina ${context.session.label}`}
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>
            {context.exercises.length} ejercicios ·{" "}
            {context.exercises.reduce((n, e) => n + e.prescribed.sets, 0)} series
            {weekday === null ? "" : ` · ${day(addDays(pack.weekStart, weekday))}`}
          </Text>
          <Action
            label={`Consultar rutina descargada ${context.session.label}`}
            secondary
            onPress={() =>
              router.push({ pathname: "/routine/[id]", params: { id: context.session.id } })
            }
          />
        </View>
      ))}
    </View>
  );
}
