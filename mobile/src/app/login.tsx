import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Icon } from "../components/icon";
import { Action, Notice, s, usePalette } from "../components/ui";
import { EntryIdentity, EntryPage } from "../components/entry-screen";
import { useSession } from "../lib/session";
import { useAccountRemoval } from "../lib/account-removal-context";
export default function Login() {
  const { removal } = useAccountRemoval();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const p = usePalette(),
    { client, state } = useSession();
  const { height } = useWindowDimensions();
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
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
      <EntryPage compact={compact}>
        <EntryIdentity />
        <View style={{ gap: compact || height < 650 ? 20 : 28 }}>
          <View style={{ gap: 8 }}>
            <Text
              accessibilityRole="header"
              style={[s.heading, { color: p.ink, fontSize: 32, lineHeight: 39 }]}
            >
              Inicia sesión
            </Text>
            <Text style={[s.body, { color: p.muted }]}>Tu espacio de entrenamiento.</Text>
          </View>
          {removal.completion ? (
            <Notice
              message={
                removal.completion === "server_deleted"
                  ? "Tu cuenta fue borrada del servidor y completamos la limpieza de este dispositivo."
                  : "Se borraron solo los registros de esta cuenta en este dispositivo. No tenemos confirmación de borrado de tu cuenta remota."
              }
            />
          ) : null}
          {reason === "registered" || reason === "password" ? (
            <Text accessibilityRole="alert" style={[s.body, { color: p.success }]}>
              {reason === "registered"
                ? "Tu cuenta está lista. Entra con el correo de la invitación y la contraseña que elegiste."
                : "Contraseña actualizada. Entra con tu contraseña nueva; tus registros locales se conservan."}
            </Text>
          ) : null}
          <View style={{ gap: 20 }}>
            <View style={{ gap: 8 }}>
              <Text style={[s.label, { color: p.muted, fontSize: 14 }]}>Correo</Text>
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
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                style={[
                  s.input,
                  {
                    minHeight: 56,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    color: p.ink,
                    borderColor: focusedField === "email" ? p.blue : p.control,
                    backgroundColor: p.field,
                  },
                ]}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordInput.current?.focus()}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={[s.label, { color: p.muted, fontSize: 14 }]}>Contraseña</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: p.field,
                  borderColor: focusedField === "password" ? p.blue : p.control,
                  borderWidth: 1,
                  borderRadius: 12,
                }}
              >
                <TextInput
                  keyboardAppearance={p.dark ? "dark" : "light"}
                  selectionColor={p.blue}
                  accessibilityLabel="Contraseña"
                  ref={passwordInput}
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
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="go"
                  style={[
                    s.input,
                    {
                      flex: 1,
                      minWidth: 0,
                      minHeight: 56,
                      borderWidth: 0,
                      paddingHorizontal: 16,
                      color: p.ink,
                      borderColor: p.control,
                      backgroundColor: "transparent",
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
                    minHeight: 56,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "transparent",
                  }}
                >
                  <Icon name={visible ? "eyeOff" : "eye"} color={p.muted} size={20} />
                </Pressable>
              </View>
            </View>
            {message ? (
              <Text
                accessibilityRole="alert"
                style={[s.body, { color: error ? p.danger : p.muted }]}
              >
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
        </View>
        <View style={{ gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tengo un enlace de mi coach"
            onPress={() => router.push("/access")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              minHeight: 64,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: p.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="link" color={p.muted} size={20} />
            <Text style={[s.body, { color: p.ink, flex: 1, fontWeight: "500" }]}>
              Tengo un enlace de mi coach
            </Text>
            <Icon name="arrow" color={p.muted} size={18} />
          </Pressable>
          <Action label="Privacidad y ayuda" quiet onPress={() => router.navigate("/privacy")} />
        </View>
      </EntryPage>
    </KeyboardAvoidingView>
  );
}
