import { router } from "expo-router";
import { Text, View } from "react-native";
import { Action, Brand, Page, ScreenIntro, s, usePalette } from "../components/ui";
import { useSession } from "../lib/session";
const sections = [
  [
    "Mensajes y reintentos",
    "Al borrar un comentario, su texto sale de la conversación. Conservamos una referencia del envío para evitar duplicados y que un reintento lo vuelva a publicar. Esa referencia se elimina al borrar la cuenta o el entrenamiento.",
  ],
  [
    "Tus datos y tu coach",
    "Tu nombre, correo, planificación, entrenamientos y comentarios se guardan en el servicio de Iron Strength en Supabase. Tus medidas y fotos registradas en web son privadas; tu coach puede revisar tus datos de seguimiento. Los demás alumnos no pueden verlos.",
  ],
  [
    "En este dispositivo",
    "La app instalada conserva la credencial de renovación y el perfil verificado en el almacenamiento seguro del sistema, para abrir tus datos descargados si el servicio no está disponible. No conserva la contraseña ni el token de acceso. Las series iniciadas, cierres pendientes de envío, confirmaciones recientes, demos, descargas de semana y recibos de eliminación se guardan localmente y separados por cuenta. Los cierres se sincronizan mientras la app está abierta, al recuperar conexión o volver a ella; también puedes reintentar manualmente. Una respuesta perdida no crea otro entrenamiento. La app solo observa la conectividad; no consulta ni envía direcciones IP o MAC. La apariencia es una preferencia del dispositivo. Expo web usa la sesión solo en memoria. Recuperar acceso no elimina tu registro pendiente.",
  ],
  [
    "Salir, desinstalar o borrar",
    "Salir elimina la sesión y los registros locales de esa cuenta después de resolver sus pendientes; conserva la apariencia y las descargas separadas por cuenta. Una cola de otra versión que todavía no podemos interpretar se conserva al salir, sin abrirla desde otra cuenta. Puedes eliminar una descarga desde Cuenta sin borrar tus entrenamientos. Desinstalar no elimina la cuenta del servidor. Borrar mi cuenta elimina los datos remotos del alumno y después sus registros, cola de envíos y descargas de este dispositivo. No podemos borrar automáticamente copias exportadas o datos locales que tengas en otros dispositivos.",
  ],
  [
    "Exportar antes de borrar",
    "Puedes exportar tu historial CSV desde Cuenta en la web, iniciando sesión en ese navegador. El archivo descargado queda bajo tu control. Si quieres conservarlo, expórtalo antes de eliminar tu cuenta.",
  ],
  [
    "Ayuda y acceso",
    "Pídele ayuda al coach que te invitó para revisar tu programa o recibir un enlace de recuperación. No envíes contraseñas, enlaces de recuperación, fotos privadas ni claves en reportes de errores. Para un fallo basta indicar pantalla, acción, mensaje y versión de la app.",
  ],
];
export default function Privacy() {
  const p = usePalette(),
    { state } = useSession();
  return (
    <Page>
      <Brand />
      <ScreenIntro
        eyebrow="CUENTA Y DATOS"
        title="Privacidad y ayuda"
        description="Cómo funciona tu cuenta en esta versión."
      />
      {sections.map(([title, text]) => (
        <View key={title} style={[s.divider, { borderColor: p.border }]}>
          <Text style={[s.subheading, { color: p.ink }]}>{title}</Text>
          <Text style={[s.body, { color: p.muted }]}>{text}</Text>
        </View>
      ))}
      <Action
        label={state.status === "authenticated" ? "Volver a mi cuenta" : "Volver a iniciar sesión"}
        secondary
        onPress={() => router.replace(state.status === "authenticated" ? "/account" : "/login")}
      />
    </Page>
  );
}
