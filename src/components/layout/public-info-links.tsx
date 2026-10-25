import Link from "next/link";

export function PublicInfoLinks() {
  return (
    <nav
      aria-label="Privacidad y ayuda"
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground"
    >
      <Link
        className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
        href="/privacy"
      >
        Privacidad
      </Link>
      <Link
        className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
        href="/support"
      >
        Ayuda
      </Link>
      <Link
        className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
        href="/delete-account"
      >
        Eliminar cuenta
      </Link>
    </nav>
  );
}
