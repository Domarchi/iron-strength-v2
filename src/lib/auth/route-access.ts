import designAssets from "@/lib/design/assets.json";
import { isMobileEndpointPath } from "../mobile/paths";
// Decisión de acceso del proxy. Es solo una comprobación optimista (¿hay sesión?): el rol, el
// estado activo y los datos los protegen los layouts del servidor y la RLS (constitución 4).

// El manifiesto y los iconos de la app instalable (RF-45) no contienen datos y el navegador los pide sin sesión.
const PUBLIC_PREFIXES = [
  "/login",
  "/invite/",
  "/reset/",
  "/manifest.webmanifest",
  "/icons/",
  "/apple-icon",
  "/offline",
];

export function isOfflineResource(pathname: string): boolean {
  return pathname === "/offline" || /^\/offline-workers\/[a-f0-9]{32}\.js$/.test(pathname);
}

export function isPublicPath(pathname: string): boolean {
  if (isMobileEndpointPath(pathname)) return true;
  if (isOfflineResource(pathname) || designAssets.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix,
  );
}

export type AccessDecision = "allow" | "redirect-login";

export function accessDecision(pathname: string, authenticated: boolean): AccessDecision {
  if (authenticated || isPublicPath(pathname)) return "allow";
  return "redirect-login";
}
