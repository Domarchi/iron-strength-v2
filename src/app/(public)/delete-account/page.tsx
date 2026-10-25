import Link from "next/link";
import {
  InfoSection,
  publicInfoLink,
  SUPPORT_EMAIL,
  SupportEmail,
} from "@/components/layout/public-info";

export const metadata = {
  title: "Eliminar cuenta · Iron Strength",
  description:
    "Cómo solicitar la eliminación de tu cuenta y datos de Iron Strength, también si no puedes entrar.",
};
export default function DeleteAccountInfoPage() {
  return (
    <>
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground">TÚ DECIDES</p>
        <h1 className="text-4xl font-semibold tracking-tight">Eliminar tu cuenta</h1>
        <p className="leading-7 text-muted-foreground">
          Puedes eliminar tu cuenta de Iron Strength y sus datos asociados. Leer esta página no
          inicia el borrado.
        </p>
      </div>
      <InfoSection title="Si puedes iniciar sesión">
        <p>
          Entra a Cuenta y elige «Borrar mi cuenta». Revisa lo que se pierde y escribe la
          confirmación solicitada. Antes puedes exportar tu historial desde Cuenta en la web. Si hay
          entrenamientos pendientes de envío, resuélvelos o confirma su descarte antes de continuar.
        </p>
        <Link className={publicInfoLink} href="/account">
          Ir a Mi cuenta
        </Link>
        <p>
          La cuenta del coach propietario no permite borrado directo porque administra los programas
          de sus alumnos; su eliminación se coordina con soporte para resolver esas relaciones.
        </p>
      </InfoSection>
      <InfoSection title="Si no puedes entrar o eres el coach propietario">
        <p>Escribe desde el correo asociado a tu cuenta a:</p>
        <SupportEmail />
        <p>
          Solicita la eliminación de tu cuenta de Iron Strength. Si ya no tienes acceso a ese
          correo, indícalo para revisar cómo verificar tu identidad. No adjuntes contraseñas,
          enlaces privados o documentos de identidad sin que se haya acordado un medio adecuado.
        </p>
        <a
          className={publicInfoLink}
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Solicitud de eliminación de cuenta · Iron Strength")}`}
        >
          Redactar solicitud por correo
        </a>
        <p>La solicitud no se envía hasta que tú la envíes desde tu correo.</p>
        <p>
          Verificaremos tu identidad antes de eliminar datos. Recibir un correo o leer esta página
          no confirma que el borrado haya terminado; soporte te comunicará el resultado o lo que
          falta resolver.
        </p>
      </InfoSection>
      <InfoSection title="Qué se elimina y qué puede permanecer">
        <p>
          El borrado del alumno elimina su acceso, perfil, programas asignados, entrenamientos,
          series, medidas, fotos privadas, logros y comentarios asociados. Las plantillas del coach
          y los datos de otros alumnos permanecen.
        </p>
        <p>
          Después de la confirmación del servidor, la app intenta retirar los registros locales de
          esa cuenta en el dispositivo desde el que borras. Otros dispositivos y archivos CSV que
          hayas exportado requieren limpieza por tu parte. Salir o desinstalar por sí solo no
          elimina la cuenta del servidor.
        </p>
        <p>
          Los respaldos cifrados pueden contener datos anteriores al borrado. Su conservación tiene
          un objetivo de 30 días y puede demorarse si falla la revisión o no existe una copia
          vigente válida de reemplazo. No se borran inmediatamente al eliminar la cuenta. Los
          registros técnicos de los proveedores tienen sus propias condiciones de conservación.
        </p>
        <Link className={publicInfoLink} href="/privacy">
          Consultar conservación y privacidad
        </Link>
      </InfoSection>
    </>
  );
}
