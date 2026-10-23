const SESSION =
  /^\/api\/mobile\/v1\/sessions\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function isMobileEndpointPath(path: string): boolean {
  return (
    [
      "/api/mobile/v1/auth/login",
      "/api/mobile/v1/auth/refresh",
      "/api/mobile/v1/auth/logout",
      "/api/mobile/v1/week",
    ].includes(path) || SESSION.test(path)
  );
}
