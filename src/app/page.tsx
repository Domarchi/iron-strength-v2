import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">IRON STRENGTH</h1>
      {user ? (
        <p className="max-w-sm text-muted-foreground">
          Hola, {user.fullName}. Sesión iniciada como {user.role === "coach" ? "coach" : "alumno"}.
        </p>
      ) : (
        <>
          <p className="max-w-sm text-muted-foreground">
            Entrena tus programas, registra tus series y sigue tu progreso.
          </p>
          <Button size="lg" render={<Link href="/login" />}>
            Entrar
          </Button>
        </>
      )}
    </main>
  );
}
