import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { deleteOwnAccount } from "./account";
import { BUCKET } from "./photos";

const admin = adminClient();
const bytes = (size: number) => new Uint8Array(size).fill(7);

describe("borrar la propia cuenta (RF-48; DC-4, DC-32)", () => {
  let coachId: string;
  let coachDb: AdminClient;
  let squat: string;

  beforeAll(async () => {
    await resetUsers(admin);
    const coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@test.local",
    });
    coachId = coach.id;
    coachDb = await signedInClient(coach.email, coach.password);
    squat = (
      await admin
        .from("exercises")
        .select("id")
        .eq("name", "Sentadilla")
        .is("coach_id", null)
        .single()
    ).data!.id;
  });
  afterAll(() => resetUsers(admin));

  // Alumno con un entrenamiento, comentarios, medidas, una foto registrada y otra sin registrar.
  async function studentWithData(email: string) {
    const user = await createProfileUser(admin, {
      role: "student",
      name: email.split("@")[0],
      email,
      coachId,
    });
    const db = await signedInClient(user.email, user.password);

    const workoutId = crypto.randomUUID();
    await admin.from("workouts").insert({
      id: workoutId,
      student_id: user.id,
      started_at: "2026-09-01T15:00:00Z",
      finished_at: "2026-09-01T16:00:00Z",
      duration_seconds: 3600,
    });
    await admin.from("workout_sets").insert({
      workout_id: workoutId,
      student_id: user.id,
      exercise_id: squat,
      exercise_name: "Sentadilla",
      position: 0,
      set_number: 1,
      weight_kg: 60,
      reps: 10,
    });
    await admin
      .from("comments")
      .insert({ workout_id: workoutId, author_id: coachId, body: "Bien" });
    await admin
      .from("body_measurements")
      .insert({ student_id: user.id, measured_on: "2026-09-01", weight_kg: 80 });
    await admin.from("achievements").insert({ student_id: user.id, kind: "first_workout" });

    const registered = `${user.id}/${crypto.randomUUID()}.webp`;
    const orphan = `${user.id}/${crypto.randomUUID()}.webp`;
    for (const path of [registered, orphan]) {
      const { error } = await db.storage
        .from(BUCKET)
        .upload(path, bytes(2000), { contentType: "image/webp" });
      expect(error).toBeNull();
    }
    await admin.from("progress_photos").insert({
      student_id: user.id,
      taken_on: "2026-09-01",
      storage_path: registered,
      size_bytes: 2000,
    });
    return { user, db, workoutId, registered, orphan };
  }

  const filesOf = async (id: string) =>
    ((await admin.storage.from(BUCKET).list(id)).data ?? []).map((f) => f.name);

  it("borra los datos, las fotos (también las no registradas) y el usuario", async () => {
    const ana = await studentWithData("ana@test.local");
    const bea = await studentWithData("bea@test.local");

    expect(await filesOf(ana.user.id)).toHaveLength(2);
    expect(await deleteOwnAccount(ana.db)).toEqual({ ok: true });

    // De Ana no queda nada.
    expect(await filesOf(ana.user.id)).toEqual([]);
    expect((await admin.auth.admin.getUserById(ana.user.id)).data.user).toBeNull();
    for (const table of [
      "workouts",
      "workout_sets",
      "body_measurements",
      "achievements",
      "progress_photos",
    ] as const) {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("student_id", ana.user.id);
      expect(count, table).toBe(0);
    }
    const { count: comments } = await admin
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("workout_id", ana.workoutId);
    expect(comments).toBe(0);

    // De Bea no se toca nada.
    expect(await filesOf(bea.user.id)).toHaveLength(2);
    const { count: beaWorkouts } = await admin
      .from("workouts")
      .select("*", { count: "exact", head: true })
      .eq("student_id", bea.user.id);
    expect(beaWorkouts).toBe(1);
    await deleteOwnAccount(bea.db);
  });

  it("la cuenta borrada ya no puede iniciar sesión", async () => {
    const cris = await studentWithData("cris@test.local");
    await deleteOwnAccount(cris.db);
    const { error } = await admin.auth.signInWithPassword({
      email: "cris@test.local",
      password: cris.user.password,
    });
    expect(error).not.toBeNull();
  });

  it("el coach no puede borrar su cuenta", async () => {
    expect(await deleteOwnAccount(coachDb)).toEqual({ ok: false, reason: "forbidden" });
    expect((await admin.auth.admin.getUserById(coachId)).data.user).not.toBeNull();
  });

  it("sin sesión no hace nada", async () => {
    expect(await deleteOwnAccount(await signedInClientOrAnon())).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("si no se pueden borrar las fotos, la cuenta se conserva para reintentar", async () => {
    const dana = await studentWithData("dana@test.local");
    // Cliente cuyo Storage falla al borrar.
    const broken = new Proxy(dana.db, {
      get(target, prop, receiver) {
        if (prop === "storage") {
          return {
            from: () => ({
              list: (...args: Parameters<ReturnType<typeof dana.db.storage.from>["list"]>) =>
                dana.db.storage.from(BUCKET).list(...args),
              remove: async () => ({ data: null, error: new Error("caído") }),
            }),
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    expect(await deleteOwnAccount(broken as AdminClient)).toEqual({ ok: false, reason: "photos" });
    expect((await admin.auth.admin.getUserById(dana.user.id)).data.user).not.toBeNull();
    expect(await filesOf(dana.user.id)).toHaveLength(2);

    // Reintentar con el servicio sano termina el trabajo.
    expect(await deleteOwnAccount(dana.db)).toEqual({ ok: true });
  });
});

async function signedInClientOrAnon(): Promise<AdminClient> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  ) as AdminClient;
}
