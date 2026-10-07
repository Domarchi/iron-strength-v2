import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { BUCKET, deletePhoto, listPhotos, registerPhoto, SIGNED_URL_SECONDS } from "./photos";

const admin = adminClient();

// Bytes de prueba: el Storage valida el tipo declarado y el tamaño, no decodifica la imagen.
const bytes = (size: number) => new Uint8Array(size).fill(7);

describe("fotos de progreso (RF-40 a RF-43, DC-18)", () => {
  let studentId: string;
  let otherId: string;
  let studentDb: AdminClient;
  let coachDb: AdminClient;
  let otherDb: AdminClient;

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
    const other = await createProfileUser(admin, {
      role: "student",
      name: "Otro",
      email: "otro@test.local",
      coachId: coach.id,
    });
    studentId = student.id;
    otherId = other.id;
    coachDb = await signedInClient(coach.email, coach.password);
    studentDb = await signedInClient(student.email, student.password);
    otherDb = await signedInClient(other.email, other.password);
  });
  afterAll(async () => {
    const { data } = await admin.storage.from(BUCKET).list(studentId);
    if (data?.length)
      await admin.storage.from(BUCKET).remove(data.map((f) => `${studentId}/${f.name}`));
    await resetUsers(admin);
  });
  beforeEach(async () => {
    for (const id of [studentId, otherId]) {
      const { data } = await admin.storage.from(BUCKET).list(id);
      if (data?.length) await admin.storage.from(BUCKET).remove(data.map((f) => `${id}/${f.name}`));
    }
    await admin.from("progress_photos").delete().in("student_id", [studentId, otherId]);
  });

  async function upload(db: AdminClient, owner: string, size = 2000, type = "image/webp") {
    const path = `${owner}/${crypto.randomUUID()}.webp`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, bytes(size), { contentType: type });
    return { path, error };
  }

  it("el bucket es privado y rechaza tipos no permitidos y archivos de más de 1 MB", async () => {
    const png = await upload(studentDb, studentId, 2000, "image/png");
    expect(png.error).not.toBeNull();
    const big = await upload(studentDb, studentId, 1_048_577);
    expect(big.error).not.toBeNull();
    const ok = await upload(studentDb, studentId, 1_048_576);
    expect(ok.error).toBeNull();
  });

  it("registra una foto subida y la lista con un enlace firmado que funciona", async () => {
    const { path } = await upload(studentDb, studentId);
    expect(
      await registerPhoto({
        db: studentDb,
        studentId,
        takenOn: "2026-10-01",
        tag: "frente",
        storagePath: path,
      }),
    ).toMatchObject({ ok: true });

    const [photo] = await listPhotos(studentDb, studentId);
    expect(photo).toMatchObject({ takenOn: "2026-10-01", tag: "frente", sizeBytes: 2000 });
    const response = await fetch(photo.url);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(2000);
  });

  it("el enlace firmado dura 5 minutos", () => {
    expect(SIGNED_URL_SECONDS).toBe(300);
  });

  it("el coach ve y firma las fotos de su alumno; otro alumno no", async () => {
    const { path } = await upload(studentDb, studentId);
    await registerPhoto({
      db: studentDb,
      studentId,
      takenOn: "2026-10-01",
      tag: null,
      storagePath: path,
    });

    const seenByCoach = await listPhotos(coachDb, studentId);
    expect(seenByCoach).toHaveLength(1);
    expect((await fetch(seenByCoach[0].url)).status).toBe(200);

    expect(await listPhotos(otherDb, studentId)).toEqual([]);
  });

  it("máximo 3 fotos por fecha", async () => {
    for (let i = 0; i < 3; i++) {
      const { path } = await upload(studentDb, studentId);
      expect(
        (
          await registerPhoto({
            db: studentDb,
            studentId,
            takenOn: "2026-10-01",
            tag: null,
            storagePath: path,
          })
        ).ok,
      ).toBe(true);
    }
    const { path } = await upload(studentDb, studentId);
    expect(
      await registerPhoto({
        db: studentDb,
        studentId,
        takenOn: "2026-10-01",
        tag: null,
        storagePath: path,
      }),
    ).toEqual({ ok: false, reason: "too_many" });
    // Otra fecha sí admite
    expect(
      (
        await registerPhoto({
          db: studentDb,
          studentId,
          takenOn: "2026-10-02",
          tag: null,
          storagePath: path,
        })
      ).ok,
    ).toBe(true);
  });

  it("rechaza datos inválidos: etiqueta, fecha, ruta ajena o archivo inexistente", async () => {
    const { path } = await upload(studentDb, studentId);
    expect(
      await registerPhoto({
        db: studentDb,
        studentId,
        takenOn: "2026-10-01",
        tag: "perfil",
        storagePath: path,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await registerPhoto({
        db: studentDb,
        studentId,
        takenOn: "ayer",
        tag: null,
        storagePath: path,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await registerPhoto({
        db: studentDb,
        studentId,
        takenOn: "2999-01-01",
        tag: null,
        storagePath: path,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await registerPhoto({
        db: studentDb,
        studentId,
        takenOn: "2026-10-01",
        tag: null,
        storagePath: `${otherId}/x.webp`,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await registerPhoto({
        db: studentDb,
        studentId,
        takenOn: "2026-10-01",
        tag: null,
        storagePath: `${studentId}/no-existe.webp`,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(await listPhotos(studentDb, studentId)).toEqual([]);
  });

  it("el coach y otros alumnos no pueden registrar fotos a nombre del alumno", async () => {
    const { path } = await upload(studentDb, studentId);
    expect(
      (
        await registerPhoto({
          db: coachDb,
          studentId,
          takenOn: "2026-10-01",
          tag: null,
          storagePath: path,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await registerPhoto({
          db: otherDb,
          studentId,
          takenOn: "2026-10-01",
          tag: null,
          storagePath: path,
        })
      ).ok,
    ).toBe(false);
  });

  it("borrar elimina el archivo y la fila de forma definitiva", async () => {
    const { path } = await upload(studentDb, studentId);
    await registerPhoto({
      db: studentDb,
      studentId,
      takenOn: "2026-10-01",
      tag: null,
      storagePath: path,
    });
    const [photo] = await listPhotos(studentDb, studentId);

    expect(await deletePhoto({ db: studentDb, id: photo.id })).toEqual({ ok: true });
    expect(await listPhotos(studentDb, studentId)).toEqual([]);
    const { data } = await admin.storage.from(BUCKET).list(studentId);
    expect(data?.some((f) => path.endsWith(f.name))).toBe(false);
  });

  it("solo el dueño borra: ni el coach ni otro alumno", async () => {
    const { path } = await upload(studentDb, studentId);
    await registerPhoto({
      db: studentDb,
      studentId,
      takenOn: "2026-10-01",
      tag: null,
      storagePath: path,
    });
    const [photo] = await listPhotos(studentDb, studentId);

    expect(await deletePhoto({ db: coachDb, id: photo.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deletePhoto({ db: otherDb, id: photo.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await listPhotos(studentDb, studentId)).toHaveLength(1);
    const { data } = await admin.storage.from(BUCKET).list(studentId);
    expect(data).toHaveLength(1);
  });
});
