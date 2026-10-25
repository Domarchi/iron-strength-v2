import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminClient, createProfileUser, signedInClient, resetUsers } from "@/test/int/helpers";
import { mobileAccessApi, mobileProductionDependencies } from "./production";
import { createInvitation } from "../invitations/create";
import { isMobileTestBackend } from "../testing/mobile-backend";
if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo pila aislada de pruebas");
const admin = adminClient();
const post = (body: unknown) =>
  new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("invitación y recuperación con Auth aislado", () => {
  let coach: Awaited<ReturnType<typeof createProfileUser>>, invite: string;
  const password = "Acceso-solo-test-192";
  beforeAll(async () => {
    await resetUsers(admin);
    coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach acceso",
      email: "access-coach@test.local",
    });
    const db = await signedInClient(coach.email, coach.password);
    const created = await createInvitation({
      db,
      admin,
      coachId: coach.id,
      email: "access-student@test.local",
      siteUrl: "https://example.test",
    });
    if (!created.ok) throw Error(created.reason);
    invite = created.link.split("/").at(-1)!;
  });
  afterAll(() => resetUsers(admin));
  it("la lectura no consume y el registro usa solo el alumno invitado", async () => {
    const api = mobileAccessApi();
    for (let i = 0; i < 2; i++)
      expect(await (await api.invitation(post({ token: invite }))).json()).toMatchObject({
        status: "valida",
        email: "access-student@test.local",
      });
    const r = await api.register(post({ token: invite, name: "Ana acceso", password }));
    expect(r.status).toBe(201);
    expect(r.headers.get("Set-Cookie")).toBeNull();
    expect((await api.register(post({ token: invite, name: "Duplicada", password }))).status).toBe(
      410,
    );
    const login = await mobileProductionDependencies().login({
      email: "access-student@test.local",
      password,
    });
    expect(login.ok).toBe(true);
    if (login.ok) {
      expect(login.session.profile.role).toBe("student");
      const row = await admin
        .from("profiles")
        .select("coach_id")
        .eq("id", login.session.profile.id)
        .single();
      expect(row.data?.coach_id).toBe(coach.id);
    }
  });
  it("la contraseña inválida no consume recuperación; válida cambia acceso y el enlace no se reutiliza", async () => {
    const link = await admin.auth.admin.generateLink({
      type: "recovery",
      email: "access-student@test.local",
    });
    if (link.error || !link.data.properties) throw Error("No se pudo crear enlace de prueba");
    const token = link.data.properties.hashed_token;
    expect(token).toMatch(/^[a-f0-9]{56}$/i);
    const api = mobileAccessApi();
    expect((await api.reset(post({ token, password: "corta" }))).status).toBe(400);
    const r = await api.reset(post({ token, password: password + "-nueva" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ version: 1, ok: true });
    expect((await api.reset(post({ token, password: password + "-otra" }))).status).toBe(410);
    expect(
      (
        await mobileProductionDependencies().login({
          email: "access-student@test.local",
          password: password + "-nueva",
        })
      ).ok,
    ).toBe(true);
  });
  it("una invitación caducada o desconocida no crea usuarios", async () => {
    const db = await signedInClient(coach.email, coach.password);
    const created = await createInvitation({
      db,
      admin,
      coachId: coach.id,
      email: "expired-access@test.local",
      siteUrl: "https://example.test",
      now: new Date(Date.now() - 8 * 86400000),
    });
    if (!created.ok) throw Error(created.reason);
    const token = created.link.split("/").at(-1)!;
    const api = mobileAccessApi();
    expect(await (await api.invitation(post({ token }))).json()).toMatchObject({
      status: "vencida",
      email: null,
    });
    expect((await api.register(post({ token, name: "Caducada", password }))).status).toBe(410);
    expect(await (await api.invitation(post({ token: "z".repeat(43) }))).json()).toMatchObject({
      status: "inexistente",
      email: null,
    });
    const users = await admin.auth.admin.listUsers();
    expect(users.data.users.some((u) => u.email === "expired-access@test.local")).toBe(false);
  });
});
