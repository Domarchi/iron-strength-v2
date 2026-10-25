import type { Route } from "@playwright/test";
// Existing training fixtures have no conversation. Never handles writes or failure fixtures.
export async function fulfillEmptyCommentReads(route: Route): Promise<boolean> {
  if (route.request().method() !== "GET") return false;
  const path = new URL(route.request().url()).pathname;
  const match = /\/workouts\/([a-f0-9-]{36})\/comments$/.exec(path);
  if (!path.endsWith("/comments/unread") && !match) return false;
  await route.fulfill({
    json: match
      ? { version: 1, workoutId: match[1], items: [], nextCursor: null, unreadCount: 0 }
      : { version: 1, items: [] },
    headers: { "Access-Control-Allow-Origin": "*" },
  });
  return true;
}
