import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attemptLogin } from "@/lib/auth/login";
import { createLoginGuard, supabaseStore } from "@/lib/auth/rate-limit";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { setStudentActive } from "./set-active";

const admin = adminClient();

describe("setStudentActive (RF-8, DC-4)", () => {
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

  const loginAs = () =>
    attemptLogin(
      { email: student.email, password: student.password },
      { auth: anonClient(), guard: createLoginGuard(supabaseStore(admin)) },
    );

  it("al desactivar, bloquea el login y una sesión ya abierta deja de ver datos", async () => {
    expect(await setStudentActive({ db: coachDb, studentId: student.id, active: false })).toEqual({
      ok: true,
    });

    // La sesión que el alumno ya tenía abierta no ve ni su perfil (RLS: usuario inactivo).
    const { data: ownProfile } = await studentDb.from("profiles").select("id");
    expect(ownProfile).toEqual([]);
    const { data: exercises } = await studentDb.from("exercises").select("id").limit(1);
    expect(exercises).toEqual([]);

    expect(await loginAs()).toEqual({ ok: false, reason: "inactive" });
  });

  it("los datos del alumno se conservan mientras está desactivado", async () => {
    const { data } = await admin
      .from("profiles")
      .select("full_name, is_active")
      .eq("id", student.id)
      .single();
    expect(data).toEqual({ full_name: "Alumno", is_active: false });
  });

  it("al reactivar, vuelve a poder entrar", async () => {
    expect(await setStudentActive({ db: coachDb, studentId: student.id, active: true })).toEqual({
      ok: true,
    });
    expect(await loginAs()).toMatchObject({ ok: true, role: "student" });
  });

  it("el coach no puede desactivarse a sí mismo", async () => {
    expect(await setStudentActive({ db: coachDb, studentId: coach.id, active: false })).toEqual({
      ok: false,
      reason: "forbidden",
    });
    const { data } = await admin.from("profiles").select("is_active").eq("id", coach.id).single();
    expect(data!.is_active).toBe(true);
  });

  it("un alumno no puede desactivar a nadie", async () => {
    const fresh = await signedInClient(student.email, student.password);
    expect(
      await setStudentActive({ db: fresh, studentId: student.id, active: false }),
    ).toMatchObject({
      ok: false,
    });
    const { data } = await admin.from("profiles").select("is_active").eq("id", student.id).single();
    expect(data!.is_active).toBe(true);
  });

  it("un id inexistente da not_found", async () => {
    expect(
      await setStudentActive({
        db: coachDb,
        studentId: "00000000-0000-0000-0000-00000000dead",
        active: false,
      }),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});
