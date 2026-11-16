import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminClient, createProfileUser, signedInClient, resetUsers } from "@/test/int/helpers";
import { isMobileTestBackend } from "../testing/mobile-backend";
import {
  mobileAchievementsApi,
  mobileCheckinApi,
  mobileMeasurementsApi,
  mobileStudentsApi,
} from "./production";
import { weekStartOf } from "../../domain/dates";
import { santiagoDate } from "../../domain/dates";

if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo pila aislada");
const admin = adminClient();
type User = Awaited<ReturnType<typeof createProfileUser>>;

async function token(user: User) {
  const db = await signedInClient(user.email, user.password);
  return (await db.auth.getSession()).data.session!.access_token;
}
async function call(user: User, body?: unknown, query = "") {
  return new Request("https://example.test/" + query, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + (await token(user)), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("APIs nativas nuevas con Auth/RLS reales", () => {
  let coach: User, ana: User, bea: User;
  beforeAll(async () => {
    await resetUsers(admin);
    coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "new-coach@test.local",
    });
    ana = await createProfileUser(admin, {
      role: "student",
      name: "Ana",
      email: "new-ana@test.local",
      coachId: coach.id,
    });
    bea = await createProfileUser(admin, {
      role: "student",
      name: "Bea",
      email: "new-bea@test.local",
      coachId: coach.id,
    });
    await createProfileUser(admin, {
      role: "student",
      name: "Inactiva",
      email: "new-off@test.local",
      coachId: coach.id,
      isActive: false,
    });
  });
  afterAll(async () => {
    await resetUsers(admin);
  });

  it("check-in: crea, corrige sin duplicar, aísla alumnos y deja leer al coach por RLS", async () => {
    const api = mobileCheckinApi();
    const answers = { sleep: 4, energy: 3, soreness: 2, motivation: 5, note: "Buena semana" };
    const empty = await api.read(await call(ana));
    expect(empty.status).toBe(200);
    expect((await empty.json()).answers).toBeNull();
    const saved = await api.save(await call(ana, { version: 1, answers }));
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.weekStart).toBe(weekStartOf(new Date()));
    expect(body.answers).toEqual(answers);
    // Reenviar y corregir deja una sola fila de la semana.
    const fixed = await api.save(
      await call(ana, { version: 1, answers: { ...answers, energy: 5, note: null } }),
    );
    expect((await fixed.json()).answers.energy).toBe(5);
    const rows = await admin.from("weekly_checkins").select("energy,note").eq("student_id", ana.id);
    expect(rows.data).toEqual([{ energy: 5, note: null }]);
    // Otro alumno no ve ni toca el de Ana.
    expect((await (await api.read(await call(bea))).json()).answers).toBeNull();
    // El coach lee el de su alumno con su propia sesión (RLS), pero la API es solo del propio alumno.
    const coachDb = await signedInClient(coach.email, coach.password);
    const seen = await coachDb.from("weekly_checkins").select("student_id");
    expect(seen.data).toEqual([{ student_id: ana.id }]);
    expect((await api.read(await call(coach))).status).toBe(401);
    // Entradas inválidas no llegan a la base.
    expect(
      (await api.save(await call(ana, { version: 1, answers: { ...answers, sleep: 9 } }))).status,
    ).toBe(400);
    expect((await api.read(new Request("https://example.test/"))).status).toBe(401);
  });

  it("medidas: guarda, exige confirmar el reemplazo, aísla y borra solo lo propio", async () => {
    const api = mobileMeasurementsApi();
    const today = santiagoDate(new Date());
    const measurement = {
      measuredOn: today,
      weightKg: 80.5,
      waistCm: 82,
      chestCm: null,
      armCm: null,
    };
    expect(
      (await api.save(await call(ana, { version: 1, measurement, replace: false }))).status,
    ).toBe(200);
    const dup = await api.save(
      await call(ana, {
        version: 1,
        measurement: { ...measurement, weightKg: 79 },
        replace: false,
      }),
    );
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.code).toBe("exists");
    const replaced = await api.save(
      await call(ana, { version: 1, measurement: { ...measurement, weightKg: 79 }, replace: true }),
    );
    expect((await replaced.json()).status).toBe("replaced");
    const list = await (await api.list(await call(ana))).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ measuredOn: today, weightKg: 79, waistCm: 82 });
    // Futuro y rangos inválidos se rechazan en la base/dominio.
    const future = await api.save(
      await call(ana, {
        version: 1,
        measurement: { ...measurement, measuredOn: "2099-01-01" },
        replace: false,
      }),
    );
    expect(future.status).toBe(400);
    // Bea no ve ni borra la medida de Ana.
    expect((await (await api.list(await call(bea))).json()).items).toEqual([]);
    const id = list.items[0].id;
    expect((await api.remove(await call(bea, { version: 1, id }))).status).toBe(404);
    expect((await (await api.list(await call(ana))).json()).items).toHaveLength(1);
    expect((await api.remove(await call(ana, { version: 1, id }))).status).toBe(200);
    expect((await (await api.list(await call(ana))).json()).items).toEqual([]);
  });

  it("logros: refleja solo los propios con su racha y contador reales", async () => {
    const api = mobileAchievementsApi();
    const none = await (await api.read(await call(bea))).json();
    expect(none).toMatchObject({
      version: 1,
      streak: { current: 0, longest: 0 },
      workoutCount: 0,
      earned: [],
    });
    expect(
      (await admin.from("achievements").insert({ student_id: ana.id, kind: "first_workout" }))
        .error,
    ).toBeNull();
    const mine = await (await api.read(await call(ana))).json();
    expect(mine.earned.map((a: { kind: string }) => a.kind)).toEqual(["first_workout"]);
    expect((await (await api.read(await call(bea))).json()).earned).toEqual([]);
    expect((await api.read(await call(ana, undefined, "?studentId=" + bea.id))).status).toBe(400);
  });

  it("alumnos del coach: solo el coach, solo activos y sin ver a otros coaches", async () => {
    const api = mobileStudentsApi();
    const list = await api.read(await call(coach));
    expect(list.status).toBe(200);
    const names = (await list.json()).students.map((s: { fullName: string }) => s.fullName).sort();
    expect(names).toEqual(["Ana", "Bea"]);
    expect(names).not.toContain("Inactiva");
    expect((await api.read(await call(ana))).status).toBe(403);
    expect((await api.read(await call(coach, undefined, "?studentId=" + ana.id))).status).toBe(400);
  });
});
