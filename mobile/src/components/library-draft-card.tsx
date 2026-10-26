import { router } from "expo-router";
import { Text, View } from "react-native";
import { useLibraryDrafts } from "../lib/library-context";
import { Action, Notice, s, usePalette } from "./ui";
export function LibraryDraftCard() {
  const p = usePalette(),
    { controller, library } = useLibraryDrafts();
  const changed = library.drafts.filter((d) => d.changed);
  if (!changed.length && !library.pending && !library.error) return null;
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text style={[s.label, { color: p.ink }]}>
        {library.pending ? "Rutina sin confirmar" : "Cambios en tus rutinas"}
      </Text>
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
      <Text style={[s.caption, { color: p.muted }]}>
        {library.dirty
          ? "Cambios pendientes de guardar en este dispositivo."
          : library.pending
            ? "Conservamos el mismo intento para confirmar el guardado."
            : `${changed.length} ${changed.length === 1 ? "borrador guardado" : "borradores guardados"} en este dispositivo.`}
      </Text>
      <Action
        label="Revisar cambios de rutinas"
        secondary
        disabled={library.busy}
        onPress={() => router.navigate("/library")}
      />
    </View>
  );
}
