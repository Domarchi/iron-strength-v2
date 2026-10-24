import { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Icon } from "../components/icon";
import { Action, Brand, Page, s, usePalette } from "../components/ui";
import { useSession } from "../lib/session";
export default function Login() {
  const p = usePalette(),
    { client, state } = useSession();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [compact, setCompact] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setCompact(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setCompact(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  async function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await client.login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos iniciar sesión. Reintenta.");
    } finally {
      setBusy(false);
    }
  }
  const message = error ?? (state.status === "signedOut" ? state.message : null);
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page>
        <Brand />
        <View style={{ gap: 8 }}>
          <Text
            style={[s.caption, { color: p.muted, letterSpacing: 1.3, marginTop: compact ? 0 : 14 }]}
          >
            ENTRENA CON INTENCIÓN
          </Text>
          <Text
            accessibilityRole="header"
            style={[
              s.heading,
              {
                color: p.ink,
                fontSize: compact ? 28 : 44,
                lineHeight: compact ? 34 : 48,
                letterSpacing: -1.6,
              },
            ]}
          >
            Más fuerte.{"\n"}
            <Text style={{ color: p.blue }}>Serie a serie.</Text>
          </Text>
          <Text style={[s.body, { color: p.muted }]}>
            Tu plan. Tu progreso. El apoyo de tu coach.
          </Text>
        </View>
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.border, gap: 18 }]}>
          <Text style={[s.subheading, { color: p.ink }]}>Bienvenido de nuevo</Text>
          <View style={{ gap: 7 }}>
            <Text style={[s.label, { color: p.ink }]}>Correo</Text>
            <TextInput
              keyboardAppearance={p.dark ? "dark" : "light"}
              selectionColor={p.blue}
              accessibilityLabel="Correo"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              autoComplete="email"
              editable={!busy}
              placeholder="tu@correo.com"
              placeholderTextColor={p.muted}
              style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.bg }]}
              returnKeyType="next"
            />
          </View>
          <View style={{ gap: 7 }}>
            <Text style={[s.label, { color: p.ink }]}>Contraseña</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TextInput
                keyboardAppearance={p.dark ? "dark" : "light"}
                selectionColor={p.blue}
                accessibilityLabel="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!visible}
                textContentType="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                onSubmitEditing={() => {
                  void submit();
                }}
                returnKeyType="go"
                style={[
                  s.input,
                  {
                    flex: 1,
                    minWidth: 0,
                    color: p.ink,
                    borderColor: p.control,
                    backgroundColor: p.bg,
                  },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                onPress={() => setVisible((v) => !v)}
                disabled={busy}
                style={{
                  minWidth: 48,
                  minHeight: 52,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: p.raised,
                }}
              >
                <Text style={[s.caption, { color: p.ink }]}>{visible ? "Ocultar" : "Ver"}</Text>
              </Pressable>
            </View>
          </View>
          {message ? (
            <Text accessibilityRole="alert" style={[s.body, { color: error ? p.danger : p.muted }]}>
              {message}
            </Text>
          ) : null}
          <Action
            label="Entrar"
            icon="arrow"
            busy={busy}
            disabled={!email.trim() || !password}
            onPress={() => {
              void submit();
            }}
          />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Icon name="train" color={p.muted} size={18} />
          <Text style={[s.caption, { color: p.muted, flex: 1 }]}>
            PLANIFICA · ENTRENA · PROGRESA
          </Text>
        </View>
        <Text style={[s.caption, { color: p.muted, textAlign: "center" }]}>
          ¿Necesitas acceso? Pide a tu coach un enlace de invitación o recuperación.
        </Text>
      </Page>
    </KeyboardAvoidingView>
  );
}
