import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminClient, createProfileUser, signedInClient, resetUsers } from "@/test/int/helpers";
import { listOwnComments, publishOwnComment, removeOwnComment } from "./mobile-comments";
import { isMobileTestBackend } from "../testing/mobile-backend";
import { mobileCommentsApi } from "../mobile/production";
if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo pila aislada");
const admin = adminClient();
describe("comentarios móviles propios y reintentos", () => {
  let coach: Awaited<ReturnType<typeof createProfileUser>>,
    a: typeof coach,
    b: typeof coach,
    workoutId: string;
  beforeAll(async () => {
    await resetUsers(admin);
    coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "comments-coach@test.local",
    });
    a = await createProfileUser(admin, {
      role: "student",
      name: "Ana",
      email: "comments-ana@test.local",
      coachId: coach.id,
    });
    b = await createProfileUser(admin, {
      role: "student",
      name: "Bea",
      email: "comments-bea@test.local",
      coachId: coach.id,
    });
    workoutId = crypto.randomUUID();
    expect(
      (
        await admin.from("workouts").insert({
          id: workoutId,
          student_id: a.id,
          started_at: "2026-10-20T16:00:00Z",
          finished_at: "2026-10-20T16:30:00Z",
          duration_seconds: 1800,
        })
      ).error,
    ).toBeNull();
  });
  afterAll(() => resetUsers(admin));
  async function requestFor(user: typeof coach, body?: unknown) {
    const db = await signedInClient(user.email, user.password);
    const session = await db.auth.getSession();
    return new Request("https://example.test", {
      headers: {
        Authorization: "Bearer " + session.data.session!.access_token,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    });
  }
  it("respuesta perdida reintenta el mismo ID sin duplicar ni sobreescribir otro texto", async () => {
    const db = await signedInClient(a.email, a.password),
      id = crypto.randomUUID();
    expect(await publishOwnComment(db, a.id, workoutId, { id, body: "Mi mensaje" })).toMatchObject({
      ok: true,
      status: "created",
      id,
    });
    expect(await publishOwnComment(db, a.id, workoutId, { id, body: "Mi mensaje" })).toMatchObject({
      ok: true,
      status: "duplicate",
      id,
    });
    expect(await publishOwnComment(db, a.id, workoutId, { id, body: "Texto distinto" })).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect((await admin.from("comments").select("id").eq("id", id)).data).toHaveLength(1);
  });
  it("dos intentos simultáneos confirman una sola fila con identidad estable", async () => {
    const db = await signedInClient(a.email, a.password),
      id = crypto.randomUUID(),
      input = { id, body: "Un mensaje concurrente" };
    const results = await Promise.all([
      publishOwnComment(db, a.id, workoutId, input),
      publishOwnComment(db, a.id, workoutId, input),
    ]);
    expect(results.map((r) => (r.ok ? r.status : "failed")).sort()).toEqual([
      "created",
      "duplicate",
    ]);
    expect((await admin.from("comments").select("id").eq("id", id)).data).toHaveLength(1);
  });
  it("reintentar un mensaje ya eliminado no lo vuelve a publicar", async () => {
    const db = await signedInClient(a.email, a.password),
      id = crypto.randomUUID(),
      input = { id, body: "Mensaje que decidí borrar" };
    expect((await publishOwnComment(db, a.id, workoutId, input)).ok).toBe(true);
    expect(await removeOwnComment(db, a.id, workoutId, id)).toEqual({
      ok: true,
      status: "deleted",
    });
    expect(await publishOwnComment(db, a.id, workoutId, input)).toEqual({
      ok: false,
      reason: "removed",
    });
    expect((await admin.from("comments").select("id").eq("id", id)).data).toHaveLength(0);
  });
  it("otro alumno y coach sobre entrenamiento ajeno no entran en la frontera nativa; solo autor borra", async () => {
    for (const user of [coach, b]) {
      const db = await signedInClient(user.email, user.password);
      expect(await listOwnComments(db, user.id, workoutId)).toBeNull();
      expect(
        await publishOwnComment(db, user.id, workoutId, {
          id: crypto.randomUUID(),
          body: "No autorizado",
        }),
      ).toEqual({ ok: false, reason: "not_found" });
    }
    const coachDb = await signedInClient(coach.email, coach.password),
      id = crypto.randomUUID();
    expect(
      (
        await coachDb
          .from("comments")
          .insert({ id, workout_id: workoutId, author_id: coach.id, body: "Comentario del coach" })
      ).error,
    ).toBeNull();
    const db = await signedInClient(a.email, a.password);
    expect(await removeOwnComment(db, a.id, workoutId, id)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    const own = crypto.randomUUID();
    await publishOwnComment(db, a.id, workoutId, { id: own, body: "Borrar" });
    expect(await removeOwnComment(db, a.id, workoutId, own)).toEqual({
      ok: true,
      status: "deleted",
    });
    expect(await removeOwnComment(db, a.id, workoutId, own)).toEqual({
      ok: true,
      status: "absent",
    });
  });
  it("pagina con fecha e ID estables sin perder los mensajes del mismo instante", async () => {
    const rows = Array.from({ length: 55 }, (_, i) => ({
      id: crypto.randomUUID(),
      workout_id: workoutId,
      author_id: coach.id,
      body: "Página " + i,
      created_at: "2026-10-20T16:00:00Z",
    }));
    expect((await admin.from("comments").insert(rows)).error).toBeNull();
    const db = await signedInClient(a.email, a.password),
      first = await listOwnComments(db, a.id, workoutId);
    expect(first?.items).toHaveLength(50);
    const second = await listOwnComments(db, a.id, workoutId, first!.nextCursor!);
    expect(second?.nextCursor).toBeNull();
    const all = [...first!.items, ...second!.items];
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    for (const row of rows) expect(all.some((x) => x.id === row.id)).toBe(true);
  });
  it("la API nativa filtra los avisos del coach a su propia identidad y marcar leído es explícito", async () => {
    const api = mobileCommentsApi();
    expect((await api.list(await requestFor(coach), workoutId)).status).toBe(404);
    expect(await (await api.unread(await requestFor(coach))).json()).toEqual({
      version: 1,
      items: [],
    });
    const unread = await (await api.unread(await requestFor(a))).json();
    expect(unread.items[0]).toMatchObject({ workoutId });
    expect(unread.items[0].count).toBeGreaterThan(0);
    expect((await api.list(await requestFor(a), workoutId)).status).toBe(200);
    expect((await (await api.unread(await requestFor(a))).json()).items[0].count).toBe(
      unread.items[0].count,
    );
    expect((await api.markRead(await requestFor(a, {}), workoutId)).status).toBe(200);
    expect((await (await api.unread(await requestFor(a))).json()).items).toEqual([]);
    const coachDb = await signedInClient(coach.email, coach.password);
    expect(
      (
        await coachDb.from("comments").insert({
          workout_id: workoutId,
          author_id: coach.id,
          body: "Mensaje nuevo después de leído",
        })
      ).error,
    ).toBeNull();
    expect((await (await api.unread(await requestFor(a))).json()).items[0]).toMatchObject({
      workoutId,
      count: 1,
    });
  });
});
