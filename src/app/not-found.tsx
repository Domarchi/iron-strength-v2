import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">No encontramos esa página</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        El enlace puede estar mal escrito, o puede que no tengas acceso a esta pantalla.
      </p>
      <Button render={<Link href="/" />}>Ir al inicio</Button>
    </main>
  );
}
