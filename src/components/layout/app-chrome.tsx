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
  coach = false,
}: {
  coach?: boolean;
  header: React.ReactNode;
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const focus = isFocusRoute(pathname);

  return (
    <div
      className={cn(
        "app-frame flex min-h-dvh flex-1 flex-col md:pb-0",
        coach && !focus && "coach-frame",
        pathname === "/week" && "week-frame",
        focus && "workout-frame",
        // Alto de la barra inferior (4rem) más el área segura del dispositivo.
        !focus && "pb-[calc(4rem+env(safe-area-inset-bottom))]",
      )}
    >
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-primary text-primary-foreground focus:p-3 focus:min-h-11 focus:min-w-11 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      {focus ? null : header}
      <div
        className={cn(
          "app-content mx-auto w-full flex-1 px-4",
          focus ? "max-w-2xl" : "max-w-5xl md:px-6",
        )}
      >
        {focus ? null : nav}
        <main id="main-content" className={cn("min-w-0", focus ? "py-0" : "py-5 md:py-6")}>
          {children}
        </main>
      </div>
    </div>
  );
}
