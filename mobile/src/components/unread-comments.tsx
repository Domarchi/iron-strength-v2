import { useCallback } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Action, Notice, s, usePalette } from "./ui";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
export function UnreadComments({ all = false }: { all?: boolean }) {
  const { state } = useSession();
  return state.status === "authenticated" && state.mode === "offline" ? null : (
    <OnlineUnreadComments all={all} />
  );
}
function OnlineUnreadComments({ all = false }: { all?: boolean }) {
  const p = usePalette(),
    { client } = useSession();
  const request = useCallback(() => client.unreadComments(), [client]),
    q = useQuery(request);
  if (q.error)
    return (
      <Notice
        message={"No pudimos comprobar tus comentarios pendientes. " + q.error}
        retry={q.retry}
      />
    );
  const rows = q.value?.items ?? [];
  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text style={[s.subheading, { color: p.ink }]}>
        {total === 1 ? "Un comentario nuevo" : `${total} comentarios nuevos`}
      </Text>
      <Text style={[s.body, { color: p.muted }]}>
        Revisa la conversación junto al entrenamiento que comenta.
      </Text>
      {rows.slice(0, all ? rows.length : 3).map((row, i) => (
        <Action
          key={row.workoutId}
          label={
            rows.length === 1 ? "Ver comentario pendiente" : `Ver conversación pendiente ${i + 1}`
          }
          secondary
          onPress={() => router.navigate(`/result/${row.workoutId}`)}
        />
      ))}
      {!all && rows.length > 3 ? (
        <Action
          label="Ver todos los comentarios pendientes"
          secondary
          onPress={() => router.navigate("/history")}
        />
      ) : null}
    </View>
  );
}
