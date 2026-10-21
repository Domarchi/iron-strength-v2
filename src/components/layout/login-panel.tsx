import { Brand } from "./brand";

export function LoginPanel({ message, children }: { message?: string; children: React.ReactNode }) {
  return (
    <main className="login-shell flex min-h-dvh flex-1 flex-col px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl justify-center sm:justify-start">
        <Brand />
      </div>
      <div className="flex flex-1 items-center justify-center py-8">
        <section
          className="login-card mx-auto w-full max-w-sm rounded-2xl border bg-card p-6 sm:p-8"
          aria-labelledby="login-heading"
        >
          <h1 id="login-heading" className="text-3xl font-bold tracking-tight">
            Iniciar sesión
          </h1>
          <p className="mt-3 mb-8 text-sm text-muted-foreground">
            {message || "Accede a tus programas y registra tus entrenamientos."}
          </p>
          {children}
          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            ¿Necesitas acceso o recuperar tu contraseña?
            <br />
            Habla con tu coach.
          </p>
        </section>
      </div>
    </main>
  );
}
