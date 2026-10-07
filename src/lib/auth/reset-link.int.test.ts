import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  randomPassword,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { createResetLink } from "./reset-link";

const admin = adminClient();
const SITE_URL = "http://127.0.0.1:3000";

describe("createResetLink (RF-7)", () => {
  let coach: Awaited<ReturnType<typeof createProfileUser>>;
  let student: Awaited<ReturnType<typeof createProfileUser>>;
  let coachDb: AdminClient;
  let studentDb: AdminClient;

  beforeAll(async () => {
    await resetUsers(admin);
    coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@test.local",
    });
    student = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: "alumno@test.local",
      coachId: coach.id,
    });
    coachDb = await signedInClient(coach.email, coach.password);
    studentDb = await signedInClient(student.email, student.password);
  });
  afterAll(() => resetUsers(admin));

  const generate = (studentId: string, db = coachDb) =>
    createResetLink({ db, admin, studentId, siteUrl: SITE_URL });

  it("genera un enlace /reset/<token> con el que el alumno cambia su contraseña", async () => {
    const result = await generate(student.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.link.startsWith(`${SITE_URL}/reset/`)).toBe(true);

    const tokenHash = result.link.slice(`${SITE_URL}/reset/`.length);
    const visitor = anonClient();
    const { error: verifyError } = await visitor.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    expect(verifyError).toBeNull();

    const newPassword = randomPassword();
    const { error: updateError } = await visitor.auth.updateUser({ password: newPassword });
    expect(updateError).toBeNull();

    expect(
      (
        await anonClient().auth.signInWithPassword({
          email: student.email,
          password: student.password,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await anonClient().auth.signInWithPassword({ email: student.email, password: newPassword }))
        .error,
    ).toBeNull();
  });

  it("el enlace es de un solo uso", async () => {
    const result = await generate(student.id);
    if (!result.ok) throw new Error("debía generar");
    const tokenHash = result.link.slice(`${SITE_URL}/reset/`.length);

    expect(
      (await anonClient().auth.verifyOtp({ type: "recovery", token_hash: tokenHash })).error,
    ).toBeNull();
    expect(
      (await anonClient().auth.verifyOtp({ type: "recovery", token_hash: tokenHash })).error,
    ).not.toBeNull();
  });

  it("un alumno no puede generar enlaces (ni para sí mismo ni para otros)", async () => {
    expect(await generate(student.id, studentDb)).toEqual({ ok: false, reason: "not_found" });
    expect(await generate(coach.id, studentDb)).toEqual({ ok: false, reason: "not_found" });
  });

  it("el coach no genera enlaces para sí mismo (usa el panel de Supabase)", async () => {
    expect(await generate(coach.id)).toEqual({ ok: false, reason: "not_student" });
  });

  it("un id inexistente da not_found", async () => {
    expect(await generate("00000000-0000-0000-0000-00000000dead")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("funciona también con un alumno desactivado (el coach puede reactivarlo después)", async () => {
    const inactive = await createProfileUser(admin, {
      role: "student",
      name: "Inactivo",
      email: "inactivo@test.local",
      coachId: coach.id,
      isActive: false,
    });
    expect((await generate(inactive.id)).ok).toBe(true);
  });

  it("el enlace vence a las 24 horas (config de Supabase)", async () => {
    const { readFileSync } = await import("node:fs");
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config).toMatch(/^otp_expiry = 86400$/m);
  });
});
