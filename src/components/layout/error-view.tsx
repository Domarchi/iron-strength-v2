"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Pantalla de error con botón de reintentar (DC-20, RF-46). Nunca deja al usuario sin salida.
export function ErrorView({ reset, timeout }: { reset: () => void; timeout?: boolean }) {
  return (
    <main
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-xl font-semibold">
        {timeout ? "Esto está tardando demasiado" : "No se pudo cargar esta pantalla"}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {timeout
          ? "El servidor no respondió a tiempo. Revisa tu conexión e inténtalo de nuevo."
          : "Algo salió mal de nuestro lado. Inténtalo de nuevo; si sigue fallando, avísale a tu coach."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Button variant="outline" render={<Link href="/" />}>
          Ir al inicio
        </Button>
      </div>
    </main>
  );
}
