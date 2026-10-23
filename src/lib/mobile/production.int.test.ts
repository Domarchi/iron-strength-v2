import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminClient, createProfileUser, resetUsers, signedInClient } from "@/test/int/helpers";
import { mobileProductionDependencies } from "./production";
import { createMobileApi } from "./api";
import { mobileSessionSchema, type MobileSession } from "./contracts";
import { hashEmail } from "../auth/rate-limit";
import { addDays, mondayOf, santiagoDate } from "../../domain/dates";
import { isMobileTestBackend } from "../testing/mobile-backend";
// Antes de crear cliente o registrar hooks: afterAll también corre si falla beforeAll.
if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo pila aislada 55321 o runner efímero hospedado por GitHub");
const admin = adminClient();
const api = () => createMobileApi(mobileProductionDependencies());
const post = (path: string, body: unknown, token?: string) =>
  new Request("https://example.test/api/mobile/v1/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
const get = (path: string, token: string) =>
  new Request("https://example.test/api/mobile/v1/" + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
describe("cliente móvil con Auth y RLS reales", () => {
  let coach: { id: string; email: string; password: string },
    alice: typeof coach,
    bob: typeof coach;
  const programs = new Map<string, { id: string; session: string }>();
  beforeAll(async () => {
    await resetUsers(admin);
    coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach móvil",
      email: "mobile-coach@test.local",
    });
    alice = await createProfileUser(admin, {
      role: "student",
      name: "Ana móvil",
      email: "mobile-alice@test.local",
      coachId: coach.id,
    });
    bob = await createProfileUser(admin, {
      role: "student",
      name: "Bruno móvil",
      email: "mobile-bob@test.local",
      coachId: coach.id,
    });
    const exercise = await admin
      .from("exercises")
      .select("id")
      .eq("name", "Sentadilla")
      .is("coach_id", null)
      .single();
    expect(exercise.error).toBeNull();
    const monday = mondayOf(santiagoDate(new Date()));
    for (const person of [coach, alice, bob]) {
      const p = await admin
        .from("programs")
        .insert({
          coach_id: coach.id,
          student_id: person.id,
          name: `Programa ${person.id}`,
          weeks_count: 1,
          start_date: monday,
          ends_on: addDays(monday, 6),
        })
        .select("id")
        .single();
      expect(p.error).toBeNull();
      const s = await admin
        .from("program_sessions")
        .insert({
          program_id: p.data!.id,
          week_number: 1,
          label: "A",
          position: 0,
          title: "Tren inferior",
        })
        .select("id")
        .single();
      expect(s.error).toBeNull();
      const row = await admin.from("session_exercises").insert({
        program_session_id: s.data!.id,
        exercise_id: exercise.data!.id,
        position: 0,
        sets: 3,
        reps_min: 8,
        reps_max: 12,
        target_weight_kg: 50,
        rest_seconds: 60,
        note: "Controla el movimiento",
      });
      expect(row.error).toBeNull();
      programs.set(person.id, { id: p.data!.id, session: s.data!.id });
    }
  });
  beforeEach(async () => {
    await admin
      .from("login_attempts")
      .delete()
      .in(
        "email_hash",
        [coach, alice, bob].map((p) => hashEmail(p.email)),
      );
    await admin.from("profiles").update({ is_active: true }).in("id", [coach.id, alice.id, bob.id]);
  });
  afterAll(() => resetUsers(admin));
  async function login(person: typeof coach): Promise<MobileSession> {
    const r = await api().login(
      post("auth/login", { email: person.email, password: person.password }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("Set-Cookie")).toBeNull();
    expect(r.headers.get("Cache-Control")).toContain("no-store");
    return mobileSessionSchema.parse(await r.json());
  }
  it("coach y alumno entran con su cuenta y ven solo su propia semana", async () => {
    for (const person of [coach, alice]) {
      const session = await login(person);
      expect(session.profile.id).toBe(person.id);
      const r = await api().week(get("week?alumno=" + bob.id, session.accessToken));
      expect(r.status).toBe(200);
      const data = await r.json();
      expect(data.kind).toBe("active");
      expect(data.program.id).toBe(programs.get(person.id)!.id);
      expect(data.sessions[0].sessionId).toBe(programs.get(person.id)!.session);
    }
  });
  it("consulta propia conserva prescripción; UUID ajeno da 404 y no crea un entrenamiento", async () => {
    const session = await login(alice);
    const own = await api().routine(
      get("sessions", session.accessToken),
      programs.get(alice.id)!.session,
    );
    expect(own.status).toBe(200);
    const data = await own.json();
    expect(data.exercises[0]).toMatchObject({
      name: "Sentadilla",
      prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 50 },
      restSeconds: 60,
    });
    expect(
      (await api().routine(get("sessions", session.accessToken), programs.get(bob.id)!.session))
        .status,
    ).toBe(404);
    for (const table of ["workouts", "workout_sets"] as const) {
      const result = await admin.from(table).select("id", { count: "exact", head: true });
      expect(result.count).toBe(0);
    }
  });
  it("bloqueo de intentos comparte la protección del acceso web", async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (await api().login(post("auth/login", { email: alice.email, password: "incorrecta" })))
          .status,
      ).toBe(401);
    const locked = await api().login(
      post("auth/login", { email: alice.email, password: alice.password }),
    );
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
  it("renovación vuelve a validar identidad y un perfil desactivado pierde lecturas", async () => {
    const original = await login(alice);
    const refreshed = await api().refresh(
      post("auth/refresh", { refreshToken: original.refreshToken }),
    );
    expect(refreshed.status).toBe(200);
    const next = mobileSessionSchema.parse(await refreshed.json());
    expect(next.profile.id).toBe(alice.id);
    await admin.from("profiles").update({ is_active: false }).eq("id", alice.id);
    expect((await api().week(get("week", next.accessToken))).status).toBe(401);
    expect(
      (await api().refresh(post("auth/refresh", { refreshToken: next.refreshToken }))).status,
    ).toBe(401);
  });
  it("salir de móvil revoca su refresh y conserva otra sesión de la misma cuenta", async () => {
    const web = await signedInClient(alice.email, alice.password);
    const prior = (await web.auth.getSession()).data.session!;
    const mobile = await login(alice);
    const out = await api().logout(
      post("auth/logout", { refreshToken: mobile.refreshToken }, mobile.accessToken),
    );
    expect(out.status).toBe(200);
    expect(
      (await api().refresh(post("auth/refresh", { refreshToken: mobile.refreshToken }))).status,
    ).toBe(401);
    expect(
      (await web.auth.refreshSession({ refresh_token: prior.refresh_token })).error,
    ).toBeNull();
  });
});
