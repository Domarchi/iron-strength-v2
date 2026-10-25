const WORKOUT =
  /^\/api\/mobile\/v1\/workouts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SESSION =
  /^\/api\/mobile\/v1\/sessions\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const COMMENTS =
  /^\/api\/mobile\/v1\/workouts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/comments(?:\/(?:read|delete))?$/i;
export function isMobileEndpointPath(path: string): boolean {
  return (
    [
      "/api/mobile/v1/auth/login",
      "/api/mobile/v1/auth/invitation",
      "/api/mobile/v1/auth/register",
      "/api/mobile/v1/auth/reset-password",
      "/api/mobile/v1/auth/refresh",
      "/api/mobile/v1/auth/logout",
      "/api/mobile/v1/account/delete",
      "/api/mobile/v1/comments/unread",
      "/api/mobile/v1/week",
      "/api/mobile/v1/workouts",
      "/api/mobile/v1/progress",
    ].includes(path) ||
    SESSION.test(path) ||
    WORKOUT.test(path) ||
    COMMENTS.test(path)
  );
}
