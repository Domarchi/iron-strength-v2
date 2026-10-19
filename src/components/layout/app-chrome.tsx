"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isFocusRoute } from "./nav-items";

// Marco de la app (RF-50 a RF-52): cabecera arriba y navegación abajo, salvo en el modo enfoque de la
// sesión de entrenamiento, que muestra solo su propia barra. Los nodos llegan ya renderizados desde
// el servidor; aquí solo se decide cuáles se muestran.
export function AppChrome({
  header,
  nav,
  children,
}: {
  header: React.ReactNode;
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  const focus = isFocusRoute(usePathname());

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-1 flex-col md:pb-0",
        // Alto de la barra inferior (4rem) más el área segura del dispositivo.
        !focus && "pb-[calc(4rem+env(safe-area-inset-bottom))]",
      )}
    >
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      {focus ? null : header}
      <div
        className={cn(
          "mx-auto w-full flex-1 px-4",
          focus
            ? "max-w-2xl"
            : "max-w-7xl md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10 md:px-8",
        )}
      >
        {focus ? null : <div className="md:border-r md:pr-6 md:pt-8">{nav}</div>}
        <main id="main-content" className={cn("min-w-0", focus ? "py-0" : "py-7 md:py-10")}>
          {children}
        </main>
      </div>
    </div>
  );
}
