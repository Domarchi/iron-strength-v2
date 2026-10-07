import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { createInvitation } from "./create";
import { hashToken } from "./token";

const admin = adminClient();
const SITE_URL = "http://127.0.0.1:3000";

describe("createInvitation (RF-1, DC-2)", () => {
  let coachDb: AdminClient;
  let studentDb: AdminClient;
  let coachId: string;

  beforeAll(async () => {
    await resetUsers(admin);
    const coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@test.local",
    });
    const student = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: "alumno@test.local",
      coachId: coach.id,
    });
    coachId = coach.id;
    coachDb = await signedInClient(coach.email, coach.password);
    studentDb = await signedInClient(student.email, student.password);
  });
  afterAll(() => resetUsers(admin));
  beforeEach(async () => {
    await admin.from("invitations").delete().neq("email", "");
  });

  const create = (email: string, db = coachDb, now?: Date) =>
    createInvitation({ db, admin, coachId, email, siteUrl: SITE_URL, now });

  it("crea una invitación de un solo uso que vence en 7 días", async () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const result = await create("nuevo@test.local", coachDb, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.expiresAt.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    const { data } = await admin
      .from("invitations")
      .select("*")
      .eq("email", "nuevo@test.local")
      .single();
    expect(data).toMatchObject({ coach_id: coachId, used_at: null });
    expect(new Date(data!.expires_at).toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });

  it("el enlace lleva el token y en la base solo queda su hash", async () => {
    const result = await create("nuevo@test.local");
    if (!result.ok) throw new Error("debía crear");

    expect(result.link.startsWith(`${SITE_URL}/invite/`)).toBe(true);
    const token = result.link.slice(`${SITE_URL}/invite/`.length);
    const { data } = await admin
      .from("invitations")
      .select("token_hash")
      .eq("email", "nuevo@test.local")
      .single();
    expect(data!.token_hash).toBe(hashToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("normaliza el correo", async () => {
    const result = await create("  Nuevo@Test.LOCAL ");
    expect(result.ok).toBe(true);
    const { data } = await admin.from("invitations").select("email");
    expect(data!.map((r) => r.email)).toEqual(["nuevo@test.local"]);
  });

  it("rechaza un correo inválido", async () => {
    expect(await create("no-es-correo")).toEqual({ ok: false, reason: "invalid_email" });
    expect(await create("")).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("rechaza un correo que ya tiene cuenta, sin distinguir mayúsculas", async () => {
    expect(await create("alumno@test.local")).toEqual({ ok: false, reason: "already_registered" });
    expect(await create("ALUMNO@test.local")).toEqual({ ok: false, reason: "already_registered" });
  });

  it("rechaza una segunda invitación vigente para el mismo correo", async () => {
    expect((await create("nuevo@test.local")).ok).toBe(true);
    expect(await create("nuevo@test.local")).toEqual({ ok: false, reason: "already_invited" });
  });

  it("reemplaza una invitación vencida por una nueva", async () => {
    const past = new Date(Date.now() - 10 * 24 * 3600_000);
    expect((await create("nuevo@test.local", coachDb, past)).ok).toBe(true);

    expect((await create("nuevo@test.local")).ok).toBe(true);
    const { data } = await admin.from("invitations").select("id").eq("email", "nuevo@test.local");
    expect(data).toHaveLength(1);
  });

  it("permite invitar de nuevo a quien tenía una invitación ya usada que no llegó a registrarse", async () => {
    await admin.from("invitations").insert({
      coach_id: coachId,
      email: "usada@test.local",
      token_hash: "h-usada",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used_at: new Date().toISOString(),
    });
    expect((await create("usada@test.local")).ok).toBe(true);
  });

  it("un alumno no puede crear invitaciones (RLS)", async () => {
    expect(await create("otro@test.local", studentDb)).toEqual({ ok: false, reason: "forbidden" });
    const { data } = await admin.from("invitations").select("id");
    expect(data).toHaveLength(0);
  });
});
