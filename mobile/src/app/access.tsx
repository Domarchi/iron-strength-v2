import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { Action, Brand, Notice, Page, ScreenIntro, s, usePalette } from "../components/ui";
import { useSession } from "../lib/session";
import { accessTicket, parseAccessLink, type AccessTicket } from "../lib/access-link";
const problems = {
  inexistente: "Esta invitación no existe. Pídele otra a tu coach.",
  usada:
    "Esta invitación ya fue usada. Si ya creaste tu cuenta, entra con la contraseña que elegiste.",
  vencida: "Esta invitación venció. Pídele otra a tu coach.",
};
export default function Access() {
  const params = useLocalSearchParams<{ kind?: string; token?: string }>();
  const initialTicket = accessTicket(params.kind, params.token);
  return (
    <AccessForm
      key={JSON.stringify([params.kind, params.token])}
      initialTicket={initialTicket}
      invalidInitial={!!(params.kind || params.token) && !initialTicket}
    />
  );
}
function AccessForm({
  initialTicket,
  invalidInitial,
}: {
  initialTicket: AccessTicket | null;
  invalidInitial: boolean;
}) {
  const p = usePalette(),
    { client, state } = useSession();
  const [ticket, setTicket] = useState<AccessTicket | null>(() => initialTicket);
  const [link, setLink] = useState(""),
    [email, setEmail] = useState<string | null>(null),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(
      invalidInitial
        ? "El enlace no es válido. Pídele uno nuevo a tu coach o ingrésalo completo."
        : null,
    );
  const field = [s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }];
  async function inspect(value: AccessTicket) {
    setTicket(value);
    setError(null);
    setEmail(null);
    if (value.kind === "reset") return;
    setBusy(true);
    try {
      const result = await client.invitation(value.token);
      if (result.status === "valida") setEmail(result.email);
      else setError(problems[result.status]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos comprobar el enlace. Reintenta.");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!ticket || busy) return;
    if (password.length < 8 || password.length > 200 || password !== confirmation) {
      setError(
        password !== confirmation
          ? "Las contraseñas no coinciden."
          : "Usa una contraseña de 8 a 200 caracteres.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (ticket.kind === "invite")
        await client.registerInvitation({ token: ticket.token, name, password });
      else await client.resetPassword({ token: ticket.token, password });
      setPassword("");
      setConfirmation("");
      setLink("");
      setTicket(null);
      router.replace({
        pathname: "/login",
        params: { reason: ticket.kind === "invite" ? "registered" : "password" },
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos confirmar la operación. Reintenta o intenta entrar con la contraseña elegida.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (state.status === "authenticated")
    return (
      <Page>
        <Brand />
        <ScreenIntro eyebrow="ACCESO MÓVIL" title="Ya estás dentro" />
        <Notice message="Para usar un enlace de acceso, sal desde Cuenta. Antes podrás resolver cualquier entrenamiento pendiente." />
        <Action label="Volver a mi cuenta" onPress={() => router.replace("/account")} />
      </Page>
    );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page>
        <Brand />
        <ScreenIntro
          eyebrow="ACCESO MÓVIL"
          title={
            ticket?.kind === "reset"
              ? "Nueva contraseña"
              : ticket?.kind === "invite"
                ? "Crea tu cuenta"
                : "Tu enlace de acceso"
          }
          description="Usa la invitación o recuperación que te entregó tu coach."
        />
        {!ticket ? (
          <View style={{ gap: 12 }}>
            <Text style={[s.label, { color: p.ink }]}>Enlace de tu coach</Text>
            <TextInput
              accessibilityLabel="Enlace de tu coach"
              value={link}
              onChangeText={setLink}
              maxLength={2048}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              editable={!busy}
              placeholder="https://…/invite/… o /reset/…"
              placeholderTextColor={p.muted}
              style={field}
            />
            <Action
              label="Revisar enlace"
              disabled={!link.trim()}
              onPress={() => {
                const value = parseAccessLink(link, client.origin);
                if (!value)
                  setError("Usa un enlace válido de Iron Strength entregado por tu coach.");
                else void inspect(value);
              }}
            />
          </View>
        ) : null}
        {ticket?.kind === "invite" && !email ? (
          <Action
            label="Comprobar invitación"
            busy={busy}
            onPress={() => {
              void inspect(ticket);
            }}
          />
        ) : null}
        {ticket && (ticket.kind === "reset" || email) ? (
          <View style={[s.card, { borderColor: p.border, backgroundColor: p.card }]}>
            {email ? (
              <>
                <Text style={[s.caption, { color: p.muted }]}>Correo de la invitación</Text>
                <Text style={[s.body, { color: p.ink }]}>{email}</Text>
                <Text style={[s.label, { color: p.ink }]}>Tu nombre</Text>
                <TextInput
                  accessibilityLabel="Tu nombre"
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  autoComplete="name"
                  editable={!busy}
                  style={field}
                />
              </>
            ) : null}
            <Text style={[s.label, { color: p.ink }]}>Contraseña nueva · mínimo 8 caracteres</Text>
            <TextInput
              accessibilityLabel="Contraseña nueva"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={200}
              editable={!busy}
              keyboardAppearance={p.dark ? "dark" : "light"}
              style={field}
            />
            <Text style={[s.label, { color: p.ink }]}>Repite la contraseña</Text>
            <TextInput
              accessibilityLabel="Repite la contraseña"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={200}
              editable={!busy}
              keyboardAppearance={p.dark ? "dark" : "light"}
              style={field}
            />
            <Text style={[s.caption, { color: p.muted }]}>
              {ticket.kind === "reset"
                ? "El enlace se verifica al guardar. Abrir esta pantalla no lo consume."
                : "Tu cuenta quedará vinculada al coach que te invitó."}
            </Text>
            <Action
              label={ticket.kind === "invite" ? "Crear mi cuenta" : "Guardar contraseña nueva"}
              busy={busy}
              disabled={!password || !confirmation || (ticket.kind === "invite" && !name.trim())}
              onPress={() => {
                void submit();
              }}
            />
          </View>
        ) : null}
        {error ? <Notice message={error} /> : null}
        <Action
          label="Volver a iniciar sesión"
          secondary
          disabled={busy}
          onPress={() => router.dismissTo("/login")}
        />
        <Action
          label="Ingresar otro enlace"
          quiet
          disabled={busy}
          onPress={() => {
            setTicket(null);
            setEmail(null);
            setLink("");
            setPassword("");
            setConfirmation("");
            setError(null);
            router.replace("/access");
          }}
        />
        <Text style={[s.caption, { color: p.muted }]}>
          ¿No tienes un enlace o venció? Pídele otro a tu coach. Si se perdió la respuesta después
          de guardar, intenta entrar con la contraseña elegida.
        </Text>
      </Page>
    </KeyboardAvoidingView>
  );
}
