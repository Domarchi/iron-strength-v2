// Next puede reconstruir request.url con su listener interno. Host sigue siendo
// la autoridad pública de la petición; no confiar en x-forwarded-host arbitrario.
export function isSameOrigin(request: Request): boolean {
  const raw = request.headers.get("origin");
  if (!raw) return false;
  try {
    const origin = new URL(raw);
    const protocol =
      request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
    return (
      (protocol === "https" || protocol === "http") &&
      origin.origin === raw &&
      origin.protocol === `${protocol}:` &&
      origin.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
}
