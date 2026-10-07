import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  randomPassword,
  resetUsers,
} from "@/test/int/helpers";
import { generateToken, hashToken } from "./token";
import { registerWithInvitation } from "./register";

const admin = adminClient();

async function addInvitation(
  coachId: string,
  email: string,
  overrides: { expiresInMs?: number; used?: boolean } = {},
) {
  const token = generateToken();
  const { error } = await admin.from("invitations").insert({
    coach_id: coachId,
    email,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + (overrides.expiresInMs ?? 7 * 24 * 3600_000)).toISOString(),
    used_at: overrides.used ? new Date().toISOString() : null,
  });
  if (error) throw error;
  return token;
}

async function userCount() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.length;
}

describe("registerWithInvitation (RF-2, RF-3, DC-2, DC-5)", () => {
  let coachId: string;

  beforeAll(async () => {
    await resetUsers(admin);
    coachId = (
      await createProfileUser(admin, { role: "coach", name: "Coach", email: "coach@test.local" })
    ).id;
  });
  afterAll(() => resetUsers(admin));
  beforeEach(async () => {
    await admin.from("invitations").delete().neq("email", "");
  });

  const register = (token: string, extra: Record<string, unknown> = {}) =>
    registerWithInvitation(admin, {
      token,
      name: "Ana Pérez",
      password: randomPassword(),
      ...extra,
    });

  it("crea el alumno con el correo de la invitación, vinculado al coach, y la marca como usada", async () => {
    const token = await addInvitation(coachId, "ana@test.local");
    const password = randomPassword();
    const result = await registerWithInvitation(admin, { token, name: "  Ana Pérez ", password });

    expect(result).toMatchObject({ ok: true, email: "ana@test.local" });
    if (!result.ok) return;

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", result.userId)
      .single();
    expect(profile).toMatchObject({
      role: "student",
      full_name: "Ana Pérez",
      coach_id: coachId,
      is_active: true,
    });

    const { data: invitation } = await admin
      .from("invitations")
      .select("used_at, used_by")
      .eq("token_hash", hashToken(token))
      .single();
    expect(invitation!.used_at).not.toBeNull();
    expect(invitation!.used_by).toBe(result.userId);

    const { error } = await anonClient().auth.signInWithPassword({
      email: "ana@test.local",
      password,
    });
    expect(error).toBeNull();
  });

  it("rechaza un enlace vencido sin crear nada", async () => {
    const before = await userCount();
    const token = await addInvitation(coachId, "vencida@test.local", { expiresInMs: -1000 });
    expect(await register(token)).toEqual({ ok: false, reason: "vencida" });
    expect(await userCount()).toBe(before);
  });

  it("rechaza un enlace ya usado", async () => {
    const before = await userCount();
    const token = await addInvitation(coachId, "usada@test.local", { used: true });
    expect(await register(token)).toEqual({ ok: false, reason: "usada" });
    expect(await userCount()).toBe(before);
  });

  it("rechaza un enlace inexistente o vacío", async () => {
    expect(await register(generateToken())).toEqual({ ok: false, reason: "inexistente" });
    expect(await register("")).toEqual({ ok: false, reason: "inexistente" });
  });

  it("rechaza un correo distinto al invitado", async () => {
    const before = await userCount();
    const token = await addInvitation(coachId, "ana@test.local");
    expect(await register(token, { email: "otra@test.local" })).toEqual({
      ok: false,
      reason: "email_mismatch",
    });
    expect(await userCount()).toBe(before);
  });

  it("si el correo ya tiene cuenta, falla y la invitación queda disponible", async () => {
    const existing = await createProfileUser(admin, {
      role: "student",
      name: "Previo",
      email: "previo@test.local",
      coachId,
    });
    const token = await addInvitation(coachId, existing.email);
    const before = await userCount();

    expect(await register(token)).toEqual({ ok: false, reason: "already_registered" });
    expect(await userCount()).toBe(before);

    const { data } = await admin
      .from("invitations")
      .select("used_at")
      .eq("token_hash", hashToken(token))
      .single();
    expect(data!.used_at).toBeNull();
  });

  it("dos registros simultáneos con el mismo enlace: solo uno prospera", async () => {
    const before = await userCount();
    const token = await addInvitation(coachId, "carrera@test.local");
    const results = await Promise.all([register(token), register(token)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)[0]).toMatchObject({ reason: "usada" });
    expect(await userCount()).toBe(before + 1);
  });

  it("valida nombre y contraseña (mínimo 8) sin consumir la invitación", async () => {
    const token = await addInvitation(coachId, "valida@test.local");
    expect(await register(token, { password: "corta" })).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(await register(token, { name: "   " })).toEqual({ ok: false, reason: "invalid_input" });

    const { data } = await admin
      .from("invitations")
      .select("used_at")
      .eq("token_hash", hashToken(token))
      .single();
    expect(data!.used_at).toBeNull();
    expect((await register(token)).ok).toBe(true);
  });
});
