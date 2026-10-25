import Link from "next/link";
import {
  InfoSection,
  publicInfoLink,
  RESPONSIBLE_NAME,
  SupportEmail,
} from "@/components/layout/public-info";

export const metadata = {
  title: "Ayuda · Iron Strength",
  description: "Ayuda con acceso, registros pendientes y tu cuenta de Iron Strength.",
};
export default function SupportPage() {
  return (
    <>
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground">
          ESTAMOS PARA AYUDARTE
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Ayuda</h1>
        <p className="leading-7 text-muted-foreground">
          Si algo no funciona, conserva tus registros y cuéntanos qué pasó.
        </p>
      </div>
      <InfoSection title="Contacta con soporte">
        <p>{RESPONSIBLE_NAME} atiende las consultas de Iron Strength en:</p>
        <SupportEmail />
        <p>
          Indica si usas Android, iPhone o web, la versión de la app, la pantalla, qué intentaste
          hacer y el mensaje del error. No envíes contraseñas, enlaces de acceso o recuperación,
          fotos privadas ni registros completos del dispositivo.
        </p>
      </InfoSection>
      <InfoSection title="Entrar o recuperar acceso">
        <p>
          El acceso requiere una invitación del coach. Pídele una invitación o un enlace nuevo de
          recuperación si el anterior venció. En la app móvil puedes pegarlo en «Tengo un enlace de
          mi coach». Tu cuenta de Expo o de la tienda es distinta de tu cuenta de Iron Strength.
        </p>
        <Link className={publicInfoLink} href="/login">
          Iniciar sesión en la web
        </Link>
      </InfoSection>
      <InfoSection title="No aparece mi rutina">
        <p>
          Revisa que estés en tu cuenta de Iron Strength y en la semana correspondiente. Si no
          tienes programa asignado o aún no comenzó, consulta a tu coach. Las rutinas demo son
          ejemplos locales: no asignan un programa real ni se envían como entrenamientos del alumno.
        </p>
      </InfoSection>
      <InfoSection title="Entrenamiento pendiente o sin conexión">
        <p>
          Descarga la semana con conexión antes de ir a entrenar. «Guardado en este dispositivo» o
          «Pendiente de enviar» aún no significan que el coach pueda ver el resultado. Abre la app
          con Internet y reintenta el envío; espera la confirmación del servidor.
        </p>
        <p>
          Si sigue fallando, conserva la app instalada y sus datos. No borres el almacenamiento ni
          reinstales mientras tengas registros pendientes. Comparte con soporte el mensaje visible,
          sin enviar el contenido privado de tu entrenamiento.
        </p>
      </InfoSection>
      <InfoSection title="Privacidad o eliminación">
        <p>
          Puedes revisar cómo se usan tus datos o solicitar la eliminación aunque ya no puedas
          entrar.
        </p>
        <div className="flex flex-wrap gap-x-6">
          <Link className={publicInfoLink} href="/privacy">
            Leer privacidad
          </Link>
          <Link className={publicInfoLink} href="/delete-account">
            Solicitar eliminación
          </Link>
        </div>
      </InfoSection>
    </>
  );
}
