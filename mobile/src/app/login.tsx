import { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
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
          <Text style={[s.heading, { color: p.ink }]}>Tu entrenamiento,{"\n"}con dirección.</Text>
          <Text style={[s.body, { color: p.muted }]}>
            Tu rutina, tu progreso y el apoyo de tu coach.
          </Text>
        </View>
        <Image
          accessibilityIgnoresInvertColors
          source={require("../../assets/hero.webp")}
          contentFit="cover"
          style={{ height: compact ? 54 : 154, width: "100%", borderRadius: 22 }}
          accessibilityLabel="Entrenamiento Iron Strength"
        />
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.border, gap: 16 }]}>
          <Text style={[s.subheading, { color: p.ink }]}>Bienvenido de nuevo</Text>
          <View style={{ gap: 7 }}>
            <Text style={[s.label, { color: p.ink }]}>Correo</Text>
            <TextInput
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
              style={[s.input, { color: p.ink, borderColor: p.border, backgroundColor: p.bg }]}
              returnKeyType="next"
            />
          </View>
          <View style={{ gap: 7 }}>
            <Text style={[s.label, { color: p.ink }]}>Contraseña</Text>
            <TextInput
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
              style={[s.input, { color: p.ink, borderColor: p.border, backgroundColor: p.bg }]}
            />
            <Action
              secondary
              label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
              onPress={() => setVisible((v) => !v)}
              disabled={busy}
            />
          </View>
          {message ? (
            <Text accessibilityRole="alert" style={[s.body, { color: error ? p.danger : p.muted }]}>
              {message}
            </Text>
          ) : null}
          <Action
            label="Entrar"
            busy={busy}
            disabled={!email.trim() || !password}
            onPress={() => {
              void submit();
            }}
          />
        </View>
        <Text style={[s.body, { color: p.muted, textAlign: "center" }]}>
          ¿Necesitas acceso? Pide a tu coach un enlace de invitación o recuperación.
        </Text>
      </Page>
    </KeyboardAvoidingView>
  );
}
