import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { PublicInfoLinks } from "@/components/layout/public-info-links";

export default function PublicInfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3"
        href="#public-content"
      >
        Ir al contenido
      </a>
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-5 sm:px-8">
        <Link href="/login" aria-label="Iron Strength · Iniciar sesión">
          <Brand />
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
        >
          Entrar a la app
        </Link>
      </header>
      <main
        id="public-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl space-y-8 px-5 py-8 outline-none sm:px-8 sm:py-12"
      >
        {children}
      </main>
      <footer className="mx-auto w-full max-w-3xl px-5 pb-8 sm:px-8">
        <PublicInfoLinks />
      </footer>
    </div>
  );
}
