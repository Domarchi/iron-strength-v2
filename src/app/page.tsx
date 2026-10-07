import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">IRON STRENGTH</h1>
      <p className="max-w-sm text-muted-foreground">
        Entrena tus programas, registra tus series y sigue tu progreso.
      </p>
      <Button size="lg">Empezar</Button>
    </main>
  );
}
