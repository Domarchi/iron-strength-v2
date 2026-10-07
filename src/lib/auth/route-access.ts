// Decisión de acceso del proxy. Es solo una comprobación optimista (¿hay sesión?): el rol, el
// estado activo y los datos los protegen los layouts del servidor y la RLS (constitución 4).

const PUBLIC_PREFIXES = ["/login", "/invite/", "/reset/"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix,
  );
}

export type AccessDecision = "allow" | "redirect-login";

export function accessDecision(pathname: string, authenticated: boolean): AccessDecision {
  if (authenticated || isPublicPath(pathname)) return "allow";
  return "redirect-login";
}
