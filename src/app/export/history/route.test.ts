import { beforeEach, it, expect, vi } from "vitest";
import { trainingHistoryFixture } from "@/test/fixtures/training-history";
import { trainingHistorySourceSchema, historyCsvRows } from "@/domain/training-history";
import { TrainingHistoryReadError } from "@/lib/data/training-history";
const state = vi.hoisted(() => ({
  logged: true,
  id: "af219000-0000-4000-8000-000000000900",
  exported: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => (state.logged ? { id: state.id } : null),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/data/export", () => ({ getHistoryExport: state.exported }));
import { GET } from "./route";
beforeEach(() => {
  state.logged = true;
  state.exported.mockReset();
  state.exported.mockResolvedValue({
    ok: true,
    studentName: "Ana",
    rows: historyCsvRows(trainingHistorySourceSchema.parse(trainingHistoryFixture())),
  });
});
it("descarga todas las dimensiones y notas en CSV privado con BOM", async () => {
  const response = await GET(new Request("https://example.test/export/history"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Disposition")).toMatch(
    /^attachment; filename="entrenamientos-ana-\d{4}-\d{2}-\d{2}\.csv"$/,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
  const text = new TextDecoder().decode(bytes);
  expect(text).toContain("Tipo de registro;Duración (s);Distancia (m)");
  expect(text).toContain("Nota sin series");
  expect(text).toContain("distance_duration");
  expect(state.exported).toHaveBeenCalledExactlyOnceWith({}, state.id);
});
it("el coach solicita un alumno explícito y la autorización queda en la fuente RLS", async () => {
  const id = crypto.randomUUID();
  expect((await GET(new Request("https://example.test/export/history?alumno=" + id))).status).toBe(
    200,
  );
  expect(state.exported).toHaveBeenCalledExactlyOnceWith({}, id);
});
it("sin sesión o con un filtro inválido no consulta datos", async () => {
  state.logged = false;
  expect((await GET(new Request("https://example.test/export/history"))).status).toBe(401);
  state.logged = true;
  expect((await GET(new Request("https://example.test/export/history?alumno=bad"))).status).toBe(
    404,
  );
  expect(state.exported).not.toHaveBeenCalled();
});
it("un alumno no visible no provoca una descarga vacía exitosa", async () => {
  state.exported.mockResolvedValue({ ok: false, reason: "not_found" });
  const r = await GET(
    new Request("https://example.test/export/history?alumno=" + crypto.randomUUID()),
  );
  expect(r.status).toBe(404);
  expect(r.headers.get("Content-Disposition")).toBeNull();
  expect(r.headers.get("Cache-Control")).toBe("no-store");
});
it.each([
  ["capacity", 409],
  ["incompatible", 409],
  ["unauthorized", 403],
  ["unavailable", 503],
] as const)(
  "un error %s conserva su causa segura sin producir un CSV parcial",
  async (code, status) => {
    state.exported.mockRejectedValue(new TrainingHistoryReadError(code));
    const r = await GET(new Request("https://example.test/export/history"));
    expect(r.status).toBe(status);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("Content-Disposition")).toBeNull();
    expect(r.headers.get("Content-Type")).not.toContain("text/csv");
  },
);
it("un fallo inesperado no expone SQL ni datos en el mensaje", async () => {
  state.exported.mockRejectedValue(Error("SQL interno con dato privado"));
  const r = await GET(new Request("https://example.test/export/history"));
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("SQL interno");
});
