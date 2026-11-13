import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Action, Notice, s, usePalette } from "./ui";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
import { useCommentDraft } from "../lib/comment-context";
import { CommentDraftCard } from "./comment-draft-card";
import type { MobileComments } from "../../../src/lib/mobile/contracts";
const when = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});
export function WorkoutComments({ workoutId }: { workoutId: string }) {
  const { state } = useSession();
  return state.status === "authenticated" && state.mode === "offline" ? (
    <>
      <Notice message="Conecta para consultar y responder comentarios. Tu mensaje pendiente se conserva." />
      <CommentDraftCard />
    </>
  ) : (
    <OnlineWorkoutComments workoutId={workoutId} />
  );
}
function OnlineWorkoutComments({ workoutId }: { workoutId: string }) {
  const p = usePalette(),
    { client } = useSession(),
    { controller, draft } = useCommentDraft();
  const request = useCallback(() => client.commentsPage(workoutId), [client, workoutId]),
    q = useQuery(request);
  const [older, setOlder] = useState<{
      anchor: string;
      items: MobileComments["items"];
      cursor: string | null;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [deleting, setDeleting] = useState<string | null>(null);
  const anchor = (q.value?.items ?? []).map((c) => c.id).join("|"),
    previous = older?.anchor === anchor ? older : null;
  const cursor = previous ? previous.cursor : q.value?.nextCursor;
  const rows = [...(q.value?.items ?? []), ...(previous?.items ?? [])]
    .filter((row, i, all) => all.findIndex((other) => other.id === row.id) === i)
    .reverse();
  const local = draft.record?.workoutId === workoutId ? draft.record : null,
    other = !!draft.record && !local;
  function refresh() {
    setOlder(null);
    q.retry();
  }
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await client.commentsPage(workoutId, cursor);
      setOlder((prev) => ({
        anchor,
        items: [...(prev?.anchor === anchor ? prev.items : []), ...page.items],
        cursor: page.nextCursor,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar comentarios anteriores.");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setError(null);
    setNotice(null);
    try {
      await controller.send();
      setNotice("Comentario confirmado en tu cuenta.");
      refresh();
    } catch {
      /* El controlador conserva y presenta un único error junto al borrador. */
    }
  }
  async function markRead() {
    setBusy(true);
    setError(null);
    try {
      await client.readComments(workoutId);
      setNotice("Lectura confirmada.");
      q.retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos confirmar la lectura.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await client.removeComment(workoutId, id);
      setDeleting(null);
      setNotice("Comentario borrado.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos confirmar el borrado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[s.divider, { borderColor: p.border }]}>
      <Text style={[s.subheading, { color: p.ink }]}>Conversación del entrenamiento</Text>
      {q.error ? <Notice message={q.error} retry={refresh} /> : null}
      {q.loading ? (
        <Text style={[s.caption, { color: p.muted }]}>Actualizando comentarios…</Text>
      ) : null}
      {q.value?.unreadCount ? (
        <>
          <Text style={[s.body, { color: p.blue }]}>
            {q.value.unreadCount} comentarios sin leer
          </Text>
          <Action
            label="Marcar conversación como leída"
            quiet
            busy={busy}
            onPress={() => {
              void markRead();
            }}
          />
        </>
      ) : null}
      {cursor ? (
        <Action
          label="Ver comentarios anteriores"
          secondary
          busy={busy}
          onPress={() => {
            void more();
          }}
        />
      ) : null}
      {q.value && !rows.length ? (
        <Text style={[s.body, { color: p.muted }]}>
          Tu coach o tú pueden comentar este entrenamiento.
        </Text>
      ) : null}
      {rows.map((c) => (
        <View
          key={c.id}
          style={[s.card, { borderColor: p.border, backgroundColor: c.mine ? p.tint : p.card }]}
        >
          <Text style={[s.caption, { color: p.muted }]}>
            {c.mine ? "Tú" : "Coach"} · {when.format(new Date(c.createdAt))}
          </Text>
          <Text selectable style={[s.body, { color: p.ink }]}>
            {c.body}
          </Text>
          {c.mine ? (
            deleting === c.id ? (
              <>
                <Text style={[s.caption, { color: p.muted }]}>
                  Este comentario se borrará de la conversación.
                </Text>
                <Action
                  label="Confirmar borrado de comentario"
                  secondary
                  busy={busy}
                  onPress={() => {
                    void remove(c.id);
                  }}
                />
                <Action
                  label="Cancelar borrado de comentario"
                  quiet
                  disabled={busy}
                  onPress={() => setDeleting(null)}
                />
              </>
            ) : (
              <Action
                label="Borrar mi comentario"
                danger
                quiet
                disabled={busy}
                onPress={() => setDeleting(c.id)}
              />
            )
          ) : null}
        </View>
      ))}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={[s.body, { color: p.success }]}>
          {notice}
        </Text>
      ) : null}
      {error ? <Notice message={error} /> : null}
      {other || draft.error ? <CommentDraftCard allowDiscard showResume={other} /> : null}
      <Text style={[s.label, { color: p.ink }]}>Tu comentario · hasta 500 caracteres</Text>
      <TextInput
        accessibilityLabel="Tu comentario"
        multiline
        maxLength={500}
        value={local?.body ?? ""}
        editable={
          draft.ready && !draft.blocked && !draft.busy && !other && local?.phase !== "pending"
        }
        onChangeText={(value) => {
          setNotice(null);
          void controller.edit(workoutId, value).catch(() => {});
        }}
        placeholder="¿Cómo te fue?"
        placeholderTextColor={p.muted}
        style={[
          s.input,
          {
            minHeight: 104,
            color: p.ink,
            backgroundColor: p.card,
            borderColor: p.control,
            textAlignVertical: "top",
          },
        ]}
        keyboardAppearance={p.dark ? "dark" : "light"}
      />
      {local ? (
        <Text style={[s.caption, { color: p.muted }]}>
          {draft.dirty
            ? "Cambios pendientes de guardar"
            : draft.rejection
              ? "Resuelve este intento antes de empezar otro mensaje."
              : local.phase === "pending"
                ? "Envío sin confirmar. El texto se conserva para reintentar el mismo mensaje."
                : "Guardado en este dispositivo"}
        </Text>
      ) : null}
      <Action
        label={
          draft.rejection
            ? "Publicación detenida"
            : local?.phase === "pending"
              ? "Reintentar publicación"
              : "Publicar comentario"
        }
        busy={draft.busy}
        disabled={
          !draft.ready || draft.blocked || !!draft.rejection || other || !local?.body.trim() || busy
        }
        onPress={() => {
          void send();
        }}
      />
      <Action
        label="Actualizar conversación"
        quiet
        disabled={busy || draft.busy}
        onPress={refresh}
      />
    </View>
  );
}
