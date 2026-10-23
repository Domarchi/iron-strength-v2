import { expect, it } from "vitest";
import { isMobileTestBackend } from "./mobile-backend";
it("solo admite 55321 local o el Supabase efímero de un runner hospedado por GitHub", () => {
  expect(isMobileTestBackend("http://127.0.0.1:55321", {})).toBe(true);
  expect(isMobileTestBackend("http://127.0.0.1:54321", {})).toBe(false);
  expect(isMobileTestBackend("http://127.0.0.1:54321", { CI: "true" })).toBe(false);
  const hosted = { CI: "true", GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted" };
  expect(isMobileTestBackend("http://127.0.0.1:54321", hosted)).toBe(true);
  expect(
    isMobileTestBackend("http://127.0.0.1:54321", { ...hosted, RUNNER_ENVIRONMENT: "self-hosted" }),
  ).toBe(false);
  expect(isMobileTestBackend("https://udwhjcnlfqlggblnpchu.supabase.co", hosted)).toBe(false);
  expect(isMobileTestBackend("http://127.0.0.1:54321/other", hosted)).toBe(false);
  expect(isMobileTestBackend(undefined, hosted)).toBe(false);
});
