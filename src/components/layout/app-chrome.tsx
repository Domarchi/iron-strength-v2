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
      {focus ? null : header}
      <div className={cn("mx-auto w-full max-w-5xl flex-1 px-4", focus ? "pt-0 pb-0" : "py-6")}>
        {children}
      </div>
      {focus ? null : <div className="md:hidden">{nav}</div>}
    </div>
  );
}
