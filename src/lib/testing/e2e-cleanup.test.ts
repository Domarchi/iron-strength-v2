import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { admin, resetAll } from "../../../e2e/support/db";
const fixtureId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("SUPABASE_SECRET_KEY", "isolated-test-only");
});
function setup(failTable: "programs" | "workouts" | null = null) {
  const events: unknown[] = [];
  const client = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              { id: fixtureId, email: "coach@iron-strength.e2e.test" },
              { id: "real-user", email: "real@example.com" },
            ],
          },
          error: null,
        }),
        deleteUser: async (id: string) => {
          events.push(["user", id]);
          return { error: null };
        },
      },
    },
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
    from: (table: string) => ({
      delete: () => ({
        in: async (field: string, ids: string[]) => {
          events.push([table, field, ids]);
          return { error: table === failTable ? Error("cleanup failed") : null };
        },
      }),
    }),
  };
  mocks.createClient.mockReturnValue(client);
  return { events, client: admin() };
}
it("limpia referencias de los programas antes del coach y nunca incluye cuentas ajenas a E2E", async () => {
  const { events, client } = setup();
  await resetAll(client);
  expect(events[0]).toEqual(["workouts", "student_id", [fixtureId]]);
  expect(events[1]).toEqual(["programs", "coach_id", [fixtureId]]);
  expect(events[2]).toEqual(["user", fixtureId]);
  expect(JSON.stringify(events)).not.toContain("real-user");
});
it("detiene la limpieza antes de borrar usuarios si falla retirar las referencias", async () => {
  const { events, client } = setup("programs");
  await expect(resetAll(client)).rejects.toThrow("cleanup failed");
  expect(events).toEqual([
    ["workouts", "student_id", [fixtureId]],
    ["programs", "coach_id", [fixtureId]],
  ]);
});

it("no borra programas ni cuentas si no pudo retirar los resultados fixture referenciados", async () => {
  const { events, client } = setup("workouts");
  await expect(resetAll(client)).rejects.toThrow("cleanup failed");
  expect(events).toEqual([["workouts", "student_id", [fixtureId]]]);
});
