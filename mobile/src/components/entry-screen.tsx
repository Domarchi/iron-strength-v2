import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { PropsWithChildren } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "../lib/appearance-context";
import { Icon } from "./icon";

export function EntryIdentity() {
  const p = usePalette();
  return (
    <View testID="entry-identity" style={styles.identity}>
      <View style={[styles.mark, { backgroundColor: p.ink }]}>
        <Icon name="train" color={p.bg} size={30} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.wordmark, { color: p.ink }]}>IRON</Text>
        <Text style={[styles.wordmark, { color: p.ink }]}>STRENGTH</Text>
      </View>
    </View>
  );
}

export function EntryPage({ children, compact = false }: PropsWithChildren<{ compact?: boolean }>) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const short = compact || height < 650;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <ScrollView
        testID="entry-page"
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.page,
          {
            paddingTop: short ? 16 : 36,
            justifyContent: short ? "flex-start" : "center",
            paddingBottom: insets.bottom + 20,
            gap: short ? 24 : 36,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function EntryLoading() {
  const p = usePalette();
  return (
    <View style={[styles.loading, { backgroundColor: p.bg }]}>
      <EntryIdentity />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <ActivityIndicator size="small" color={p.blue} />
        <Text accessibilityRole="text" style={{ fontSize: 14, lineHeight: 21, color: p.muted }}>
          Abriendo tu espacio…
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    paddingHorizontal: 28,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  mark: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  wordmark: { fontSize: 19, lineHeight: 23, fontWeight: "800", letterSpacing: 1.4 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 32 },
});
