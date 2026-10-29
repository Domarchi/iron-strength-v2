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
      "/api/mobile/v1/week/download",
      "/api/mobile/v1/workouts",
      "/api/mobile/v1/personal-workouts",
      "/api/mobile/v1/recordings",
      "/api/mobile/v1/typed-recordings",
      "/api/mobile/v1/progress",
      "/api/mobile/v1/training-progress",
      "/api/mobile/v1/workout-corrections",
      "/api/mobile/v1/workout-removals",
      "/api/mobile/v1/exercises",
      "/api/mobile/v1/training-catalog",
      "/api/mobile/v1/personal-exercises",
      "/api/mobile/v1/personal-exercises/export",
      "/api/mobile/v1/personal-exercises/mutations",
      "/api/mobile/v1/training-library",
      "/api/mobile/v1/training-library/export",
      "/api/mobile/v1/training-library/mutations",
      "/api/mobile/v1/library",
      "/api/mobile/v1/library/export",
      "/api/mobile/v1/library/mutations",
    ].includes(path) ||
    /^\/api\/mobile\/v1\/training-sessions\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      path,
    ) ||
    SESSION.test(path) ||
    WORKOUT.test(path) ||
    /^\/api\/mobile\/v1\/workout-corrections\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      path,
    ) ||
    /^\/api\/mobile\/v1\/workout-removals\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      path,
    ) ||
    COMMENTS.test(path) ||
    /^\/api\/mobile\/v1\/typed-recordings\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      path,
    ) ||
    /^\/api\/mobile\/v1\/training-catalog\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      path,
    ) ||
    /^\/api\/mobile\/v1\/exercises\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      path,
    ) ||
    /^\/api\/mobile\/v1\/progress\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      path,
    )
  );
}
