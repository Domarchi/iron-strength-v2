import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminClient, createProfileUser, signedInClient, resetUsers } from "@/test/int/helpers";
import { mobileAccountApi } from "./production";
import { isMobileTestBackend } from "../testing/mobile-backend";
if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo pila aislada");
const admin = adminClient();
describe("eliminación móvil con identidad Auth/RLS real", () => {
  let coach: Awaited<ReturnType<typeof createProfileUser>>;
  beforeAll(async () => {
    await resetUsers(admin);
    coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach cuenta",
      email: "account-coach@test.local",
    });
  });
  afterAll(async () => {
    if (coach)
      await admin.storage.from("progress-photos").remove([`${coach.id}/test-account.webp`]);
    await resetUsers(admin);
  });
  async function authenticated(
    email: string,
    password: string,
    confirmation = "BORRAR",
    extra = {},
  ) {
    const db = await signedInClient(email, password);
    const s = await db.auth.getSession();
    if (!s.data.session) throw Error("Sesión test requerida");
    return new Request("https://example.test", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + s.data.session.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmation, ...extra }),
    });
  }
  it("coach se rechaza antes de borrar sus archivos", async () => {
    const path = `${coach.id}/test-account.webp`;
    expect(
      (
        await admin.storage
          .from("progress-photos")
          .upload(path, new Uint8Array(100).fill(7), { contentType: "image/webp" })
      ).error,
    ).toBeNull();
    expect(
      (await mobileAccountApi().remove(await authenticated(coach.email, coach.password))).status,
    ).toBe(403);
    expect(
      (await admin.storage.from("progress-photos").list(coach.id)).data?.some(
        (f) => f.name === "test-account.webp",
      ),
    ).toBe(true);
  });
  it("elimina solo el alumno de Bearer; no acepta userId ni borra otra cuenta", async () => {
    const a = await createProfileUser(admin, {
      role: "student",
      name: "Ana",
      email: "account-ana@test.local",
      coachId: coach.id,
    });
    const b = await createProfileUser(admin, {
      role: "student",
      name: "Bea",
      email: "account-bea@test.local",
      coachId: coach.id,
    });
    const api = mobileAccountApi();
    expect(
      (await api.remove(await authenticated(a.email, a.password, "BORRAR", { userId: b.id })))
        .status,
    ).toBe(400);
    const result = await api.remove(await authenticated(a.email, a.password));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ version: 1, ok: true, userId: a.id });
    expect((await admin.auth.admin.getUserById(a.id)).error).not.toBeNull();
    expect((await admin.auth.admin.getUserById(b.id)).data.user?.id).toBe(b.id);
    expect((await admin.auth.admin.getUserById(coach.id)).data.user?.id).toBe(coach.id);
  });
});
