import type { Route } from "@playwright/test";
/** Legacy fixtures model a result that has no structure2/document3 endpoint. */
export async function fulfillLegacyTypedResult(route: Route): Promise<boolean> {
  const request = route.request(),
    path = new URL(request.url()).pathname;
  if (
    request.method() !== "GET" ||
    !/^\/api\/mobile\/v1\/typed-recordings\/[a-f0-9-]+$/i.test(path)
  )
    return false;
  await route.fulfill({
    status: 404,
    json: { version: 1, error: { code: "not_found", message: "Resultado de formato anterior." } },
    headers: { "Access-Control-Allow-Origin": "*" },
  });
  return true;
}
