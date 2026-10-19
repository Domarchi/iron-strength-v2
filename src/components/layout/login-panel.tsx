import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";

export function LoginPanel({ message, children }: { message?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col p-5 sm:p-8">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <Brand />
        <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:inline-flex">
          <ShieldCheck className="size-4" aria-hidden />
          Tu espacio de entrenamiento
        </span>
      </div>
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 py-12 lg:grid-cols-[1.15fr_1fr] lg:gap-24">
        <section className="hidden lg:block" aria-label="Entrena con intención">
          <p className="mb-6 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Menos ruido. Más progreso.
          </p>
          <p className="max-w-lg text-6xl leading-[1.08] font-medium tracking-[-0.05em]">
            Tu esfuerzo.
            <br />
            Tu ritmo.
            <br />
            <span className="text-primary">Tu progreso.</span>
          </p>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
            Un lugar para seguir tu programa, registrar cada serie y ver todo lo que has avanzado.
          </p>
          <div className="mt-10 max-w-sm rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Cada entrenamiento cuenta
              </span>
              <ArrowUpRight className="size-4 text-primary" aria-hidden />
            </div>
            <div className="mt-5 flex items-end gap-2" aria-hidden>
              {[30, 48, 40, 64, 56, 78, 96].map((height, i) => (
                <span
                  key={i}
                  className={
                    i === 6 ? "flex-1 rounded-t-md bg-primary" : "flex-1 rounded-t-md bg-primary/15"
                  }
                  style={{ height }}
                />
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="size-4 text-primary" aria-hidden />
              La constancia hace la diferencia.
            </p>
          </div>
        </section>
        <section
          className="mx-auto w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm sm:p-10"
          aria-labelledby="login-heading"
        >
          <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Vamos paso a paso
          </p>
          <h1 id="login-heading" className="text-3xl font-semibold tracking-tight">
            Qué bueno verte.
          </h1>
          <p className="mt-3 mb-8 text-sm leading-relaxed text-muted-foreground">
            {message || "Entra con tu correo y contraseña para continuar con tu entrenamiento."}
          </p>
          {children}
          <p className="mt-6 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
            ¿Necesitas acceso o recuperar tu contraseña? Habla con tu coach.
          </p>
        </section>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Iron Strength · Entrena con intención.
      </p>
    </main>
  );
}
