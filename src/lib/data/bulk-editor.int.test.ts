import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getProgramTree, saveSessionPrescriptions } from "./programs";
const admin = adminClient();
let db: AdminClient, programId: string, sessionId: string;
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "bulk-coach@test.local",
  });
  db = await signedInClient(coach.email, coach.password);
  programId = (
    await db
      .from("programs")
      .insert({ coach_id: coach.id, name: "Lotes", weeks_count: 2 })
      .select("id")
      .single()
  ).data!.id;
  sessionId = (
    await db
      .from("program_sessions")
      .insert({ program_id: programId, label: "A", week_number: 1 })
      .select("id")
      .single()
  ).data!.id;
  const catalog = (await db.from("exercises").select("id").is("coach_id", null).limit(3)).data!;
  const group = crypto.randomUUID();
  expect(
    (
      await db.from("session_exercises").insert(
        catalog.map((e, i) => ({
          program_session_id: sessionId,
          exercise_id: e.id,
          position: i,
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          note: "Conservar",
          target_weight_kg: 60,
          rest_seconds: 45,
          superset_id: i < 2 ? group : null,
          superset_rest_seconds: i < 2 ? 120 : null,
        })),
      )
    ).error,
  ).toBeNull();
});
afterAll(() => resetUsers(admin));
const session = async () => (await getProgramTree(db, programId))!.sessions[0];
it("el parche de series conserva notas y pesos remotos aun con una copia local antigua", async () => {
  const before = await session();
  const first = before.exercises[0];
  expect(
    (
      await db
        .from("session_exercises")
        .update({ note: "Nota remota", target_weight_kg: 75 })
        .eq("id", first.id)
    ).error,
  ).toBeNull();
  const current = await session();
  expect(
    await saveSessionPrescriptions({
      db,
      sessionId,
      expectedRevision: before.revision,
      requestId: crypto.randomUUID(),
      rows: [{ ...first, sets: 4, fields: ["sets"] }],
    }),
  ).toMatchObject({ ok: false, reason: "conflict" });
  const request = {
    db,
    sessionId,
    expectedRevision: current.revision,
    requestId: crypto.randomUUID(),
    rows: [{ ...first, sets: 4, fields: ["sets"] }],
  };
  const saved = await saveSessionPrescriptions(request);
  expect(saved.ok).toBe(true);
  expect(await saveSessionPrescriptions(request)).toEqual(saved);
  expect((await session()).exercises[0]).toMatchObject({
    sets: 4,
    note: "Nota remota",
    targetWeightKg: 75,
  });
});
it("actualiza descansos individuales y grupales juntos, con reintento idempotente", async () => {
  const current = await session();
  const rows = current.exercises.map((e) =>
    e.supersetId
      ? { ...e, supersetRestSeconds: 180, fields: ["supersetRestSeconds"] }
      : { ...e, restSeconds: 90, fields: ["restSeconds"] },
  );
  const request = {
    db,
    sessionId,
    expectedRevision: current.revision,
    requestId: crypto.randomUUID(),
    rows,
  };
  const saved = await saveSessionPrescriptions(request);
  expect(saved.ok).toBe(true);
  expect(await saveSessionPrescriptions(request)).toEqual(saved);
  const next = await session();
  expect(next.exercises.slice(0, 2).map((e) => [e.restSeconds, e.supersetRestSeconds])).toEqual([
    [45, 180],
    [45, 180],
  ]);
  expect(next.exercises[2].restSeconds).toBe(90);
});
it("SQL rechaza un lote parcial inválido y una lista de campos inventada sin cambios", async () => {
  const before = await session();
  const [a, b] = before.exercises;
  const invoke = (rows: unknown) =>
    db.rpc("mutate_routine_session", {
      p_session_id: sessionId,
      p_expected_revision: before.revision,
      p_request_id: crypto.randomUUID(),
      p_rows: rows as never,
    });
  expect(
    (
      await invoke([
        { ...a, sets: 5, fields: ["sets"] },
        { ...b, sets: 0, fields: ["sets"] },
      ])
    ).error?.code,
  ).toBe("23514");
  expect(await session()).toEqual(before);
  expect((await invoke([{ ...a, fields: ["exerciseId"] }])).error?.code).toBe("22023");
  expect(
    (await invoke([{ ...a, supersetRestSeconds: 60, fields: ["supersetRestSeconds"] }])).error
      ?.code,
  ).toBe("23514");
  expect(await session()).toEqual(before);
});
