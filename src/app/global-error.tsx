"use client";

// Último recurso: falla el propio layout raíz. Debe traer su propio <html>.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
        <h1>Algo salió mal</h1>
        <p>Inténtalo de nuevo.</p>
        <button onClick={reset} style={{ minHeight: 44, padding: "0 1.5rem" }}>
          Reintentar
        </button>
      </body>
    </html>
  );
}
