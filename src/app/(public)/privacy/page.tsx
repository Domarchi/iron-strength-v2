import Link from "next/link";
import {
  InfoSection,
  publicInfoLink,
  RESPONSIBLE_NAME,
  SupportEmail,
} from "@/components/layout/public-info";

export const metadata = {
  title: "Privacidad · Iron Strength",
  description: "Qué datos usa Iron Strength, cómo se conservan y cómo gestionar tu cuenta.",
};

export default function PrivacyPage() {
  return (
    <>
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground">
          CUENTA Y DATOS
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Privacidad</h1>
        <p className="leading-7 text-muted-foreground">
          Cómo usamos tus datos en Iron Strength, tanto en la web como en la app móvil.
        </p>
        <p className="text-sm text-muted-foreground">Vigente desde el 25 de octubre de 2026.</p>
      </div>
      <InfoSection title="Responsable y contacto">
        <p>
          El responsable de Iron Strength es {RESPONSIBLE_NAME}. Para consultas sobre tus datos,
          acceso, corrección o eliminación, escribe a:
        </p>
        <SupportEmail />
      </InfoSection>
      <InfoSection title="Qué datos usamos y para qué">
        <ul className="list-disc space-y-3 pl-5">
          <li>
            <strong className="text-foreground">Cuenta:</strong> nombre, correo e identificador para
            iniciar sesión, relacionarte con tu coach y separar tus datos de los de otras cuentas.
          </li>
          <li>
            <strong className="text-foreground">Entrenamiento:</strong> programas, ejercicios,
            series, repeticiones, cargas, descansos y sustituciones para planificar, registrar y
            mostrar historial y progreso.
          </li>
          <li>
            <strong className="text-foreground">Seguimiento:</strong> esfuerzo y notas opcionales,
            comentarios y su estado de lectura para conversar con tu coach sobre el entrenamiento.
          </li>
          <li>
            <strong className="text-foreground">Medidas y fotos privadas:</strong> se registran y
            consultan en la web para tu seguimiento. La app móvil de esta versión no las registra ni
            solicita acceso a cámara o galería.
          </li>
          <li>
            <strong className="text-foreground">Datos técnicos:</strong> los proveedores pueden
            tratar direcciones IP y registros de solicitudes, autenticación y errores para operar y
            proteger el servicio.
          </li>
        </ul>
        <p>
          No integramos HealthKit, Health Connect ni herramientas de publicidad o seguimiento
          publicitario en esta versión.
        </p>
      </InfoSection>
      <InfoSection title="Quién puede verlos y dónde se guardan">
        <p>
          Tú puedes ver tus datos y tu coach puede revisar los de los alumnos a su cargo. Los otros
          alumnos no tienen acceso a tus registros. El coach también puede registrar sus propios
          entrenamientos.
        </p>
        <p>
          Supabase aloja la autenticación, base de datos y archivos privados; Vercel aloja la web y
          la API. La comunicación con el servicio usa HTTPS. Las fotos privadas requieren
          autorización para abrirse.
        </p>
        <p>
          Los registros técnicos tienen la conservación y condiciones de la configuración y plan de
          cada proveedor. Consulta sus políticas:{" "}
          <a className="underline underline-offset-4" href="https://supabase.com/privacy">
            Supabase
          </a>{" "}
          y{" "}
          <a
            className="underline underline-offset-4"
            href="https://vercel.com/legal/privacy-policy"
          >
            Vercel
          </a>
          . No se aplica a esos registros el plazo de nuestras copias de respaldo.
        </p>
      </InfoSection>
      <InfoSection title="Qué queda en tu dispositivo">
        <p>
          La app instalada guarda la credencial de renovación y el perfil verificado en el
          almacenamiento seguro del sistema. No persiste tu contraseña ni el token de acceso. Guarda
          por cuenta las semanas descargadas, registros iniciados, envíos pendientes, comentarios en
          borrador y recibos necesarios para evitar duplicados. La apariencia es una preferencia del
          dispositivo.
        </p>
        <p>
          La web utiliza cookies de sesión y almacenamiento local para recuperar registros,
          descargas y preferencias. Para entrenar sin conexión necesitas entrar primero con conexión
          y descargar la semana. Los envíos se reintentan con la app abierta o manualmente; un
          guardado local todavía no confirma que el servidor lo recibió.
        </p>
        <p>
          Salir no elimina la cuenta del servidor. Antes de salir debes resolver los registros
          pendientes o confirmar su descarte; las descargas se mantienen separadas por cuenta.
          Desinstalar o borrar datos del navegador puede hacerte perder lo que aún no se envió.
        </p>
      </InfoSection>
      <InfoSection title="Conservación y copias de respaldo">
        <p>
          Conservamos tu cuenta y sus registros mientras uses el servicio, hasta que solicites su
          eliminación. Un comentario borrado deja una referencia técnica para impedir que un
          reintento lo publique otra vez; se retira al borrar la cuenta o el entrenamiento
          correspondiente.
        </p>
        <p>
          Se mantienen copias locales cifradas con un objetivo de conservación de 30 días. Están
          programadas semanalmente y se generan antes de migraciones; la revisión de caducidad es
          diaria. Si el equipo está apagado, hay un fallo o no existe una copia vigente válida de
          reemplazo, su retirada puede demorarse y requiere revisión. Borrar tu cuenta no retira
          inmediatamente sus datos de esos respaldos.
        </p>
        <p>
          Las copias se usan para recuperación del servicio. Antes de restaurar una copia se deben
          revisar las eliminaciones solicitadas desde su creación. Los archivos que tú hayas
          exportado o guardado en otros dispositivos quedan bajo tu control.
        </p>
      </InfoSection>
      <InfoSection title="Tus opciones">
        <p>
          Puedes exportar tu historial CSV desde Cuenta en la web y solicitar correcciones o ayuda
          por correo. Los alumnos pueden eliminar su cuenta desde Cuenta, con confirmación
          explícita. Si no puedes entrar, o eres el coach propietario, utiliza la vía de soporte
          descrita en la página de eliminación.
        </p>
        <Link className={publicInfoLink} href="/delete-account">
          Cómo eliminar tu cuenta
        </Link>
        <p>Si cambia esta información, actualizaremos esta página y su fecha de vigencia.</p>
      </InfoSection>
    </>
  );
}
