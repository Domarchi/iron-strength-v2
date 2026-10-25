import { router } from "expo-router";
import { Text, View } from "react-native";
import { Action, Brand, Page, ScreenIntro, s, usePalette } from "../components/ui";
import { useSession } from "../lib/session";
const sections = [
  [
    "Tus datos y tu coach",
    "Tu nombre, correo, planificación, entrenamientos y comentarios se guardan en el servicio de Iron Strength en Supabase. Tus medidas y fotos registradas en web son privadas; tu coach puede revisar tus datos de seguimiento. Los demás alumnos no pueden verlos.",
  ],
  [
    "En este dispositivo",
    "La app instalada conserva la credencial de renovación en el almacenamiento seguro del sistema. Las series iniciadas, demos y recibos de eliminación se guardan localmente. La apariencia es una preferencia del dispositivo. Expo web usa la sesión solo en memoria. Recuperar acceso no elimina tu registro pendiente.",
  ],
  [
    "Salir, desinstalar o borrar",
    "Salir elimina la sesión y los registros locales de esa cuenta después de resolver sus pendientes; conserva la apariencia. Desinstalar no elimina la cuenta del servidor. Borrar mi cuenta elimina los datos remotos del alumno y después sus registros de este dispositivo. No podemos borrar automáticamente copias exportadas o datos locales que tengas en otros dispositivos.",
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
