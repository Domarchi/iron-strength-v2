import { requireUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await requireUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">IRON STRENGTH</h1>
      <p className="max-w-sm text-muted-foreground">
        Hola, {user.fullName}. Sesión iniciada como {user.role === "coach" ? "coach" : "alumno"}.
      </p>
    </main>
  );
}
