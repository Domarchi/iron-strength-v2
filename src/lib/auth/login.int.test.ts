import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, createProfileUser, resetUsers } from "@/test/int/helpers";
import { createLoginGuard, supabaseStore } from "./rate-limit";
import { attemptLogin } from "./login";

const admin = adminClient();

function deps() {
  return { auth: anonClient(), guard: createLoginGuard(supabaseStore(admin)) };
}

describe("attemptLogin (RF-5, RF-6, RF-8)", () => {
  let coach: Awaited<ReturnType<typeof createProfileUser>>;
  let student: Awaited<ReturnType<typeof createProfileUser>>;
  let inactive: Awaited<ReturnType<typeof createProfileUser>>;

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
    inactive = await createProfileUser(admin, {
      role: "student",
      name: "Inactivo",
      email: "inactivo@test.local",
      coachId: coach.id,
      isActive: false,
    });
  });
  afterAll(() => resetUsers(admin));
  beforeEach(async () => {
    await admin.from("login_attempts").delete().neq("email_hash", "");
  });

  it("inicia sesión con credenciales válidas y devuelve el rol", async () => {
    const result = await attemptLogin({ email: coach.email, password: coach.password }, deps());
    expect(result).toEqual({ ok: true, userId: coach.id, role: "coach" });

    const asStudent = await attemptLogin(
      { email: student.email, password: student.password },
      deps(),
    );
    expect(asStudent).toMatchObject({ ok: true, role: "student" });
  });

  it("normaliza mayúsculas y espacios del correo", async () => {
    const result = await attemptLogin(
      { email: `  ${student.email.toUpperCase()} `, password: student.password },
      deps(),
    );
    expect(result.ok).toBe(true);
  });

  it("da el mismo error con contraseña incorrecta y con correo inexistente", async () => {
    const wrongPassword = await attemptLogin(
      { email: student.email, password: "incorrecta-123" },
      deps(),
    );
    const unknownEmail = await attemptLogin(
      { email: "nadie@test.local", password: "incorrecta-123" },
      deps(),
    );
    expect(wrongPassword).toEqual({ ok: false, reason: "invalid" });
    expect(unknownEmail).toEqual(wrongPassword);
  });

  it("rechaza datos mal formados sin consultar a Supabase", async () => {
    expect(await attemptLogin({ email: "no-es-correo", password: "x" }, deps())).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await attemptLogin({ email: student.email }, deps())).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("no deja entrar a un usuario desactivado y cierra la sesión", async () => {
    const d = deps();
    const result = await attemptLogin({ email: inactive.email, password: inactive.password }, d);
    expect(result).toEqual({ ok: false, reason: "inactive" });
    const { data } = await d.auth.auth.getSession();
    expect(data.session).toBeNull();
  });

  it("bloquea al 5º fallo, incluso con la contraseña correcta", async () => {
    for (let i = 0; i < 4; i++) {
      expect(await attemptLogin({ email: student.email, password: "mala" }, deps())).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    const fifth = await attemptLogin({ email: student.email, password: "mala" }, deps());
    expect(fifth).toEqual({ ok: false, reason: "invalid" });

    const locked = await attemptLogin({ email: student.email, password: student.password }, deps());
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    expect((locked as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(14 * 60);
  });

  it("pasados los 15 minutos vuelve a dejar entrar", async () => {
    for (let i = 0; i < 5; i++)
      await attemptLogin({ email: student.email, password: "mala" }, deps());
    expect(
      await attemptLogin({ email: student.email, password: student.password }, deps()),
    ).toMatchObject({
      reason: "locked",
    });

    // Se simula el paso del tiempo retrasando el bloqueo guardado.
    await admin
      .from("login_attempts")
      .update({
        locked_until: new Date(Date.now() - 1000).toISOString(),
        window_started_at: new Date(Date.now() - 16 * 60_000).toISOString(),
      })
      .neq("email_hash", "");

    expect(
      (await attemptLogin({ email: student.email, password: student.password }, deps())).ok,
    ).toBe(true);
  });

  it("un inicio de sesión correcto reinicia el contador de fallos", async () => {
    for (let i = 0; i < 4; i++)
      await attemptLogin({ email: student.email, password: "mala" }, deps());
    expect(
      (await attemptLogin({ email: student.email, password: student.password }, deps())).ok,
    ).toBe(true);
    for (let i = 0; i < 4; i++)
      await attemptLogin({ email: student.email, password: "mala" }, deps());
    expect(
      (await attemptLogin({ email: student.email, password: student.password }, deps())).ok,
    ).toBe(true);
  });

  it("guarda solo el hash del correo", async () => {
    await attemptLogin({ email: student.email, password: "mala" }, deps());
    const { data } = await admin.from("login_attempts").select("email_hash");
    expect(data).toHaveLength(1);
    expect(data![0].email_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
