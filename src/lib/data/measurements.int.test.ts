import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { deleteMeasurement, listMeasurements, saveMeasurement } from "./measurements";

const admin = adminClient();

describe("medidas corporales (RF-38, RF-39, DC-15)", () => {
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
  afterAll(() => resetUsers(admin));
  beforeEach(async () => {
    await admin.from("body_measurements").delete().in("student_id", [studentId, otherId]);
  });

  const save = (input: Record<string, unknown>, replace = false, db = studentDb, id = studentId) =>
    saveMeasurement({ db, studentId: id, input, replace });

  it("guarda una medida con solo algunos campos y deja el resto vacío", async () => {
    expect(await save({ measuredOn: "2026-10-01", weightKg: "80,5", waistCm: "" })).toEqual({
      ok: true,
      replaced: false,
    });
    const [m] = await listMeasurements(studentDb, studentId);
    expect(m).toMatchObject({
      measuredOn: "2026-10-01",
      weightKg: 80.5,
      waistCm: null,
      chestCm: null,
      armCm: null,
    });
  });

  it("exige al menos un campo y respeta los rangos", async () => {
    expect(await save({ measuredOn: "2026-10-01" })).toEqual({ ok: false, reason: "invalid" });
    expect(await save({ measuredOn: "2026-10-01", weightKg: "19" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await save({ measuredOn: "2026-10-01", weightKg: "301" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await save({ measuredOn: "2026-10-01", waistCm: "9" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await save({ measuredOn: "2026-10-01", armCm: "251" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await save({ measuredOn: "2999-01-01", weightKg: "80" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await listMeasurements(studentDb, studentId)).toEqual([]);
  });

  it("un registro por día: pide confirmación para reemplazar y con ella reemplaza todo el registro", async () => {
    await save({ measuredOn: "2026-10-01", weightKg: "80", waistCm: "90" });
    expect(await save({ measuredOn: "2026-10-01", weightKg: "79" })).toEqual({
      ok: false,
      reason: "exists",
    });
    expect((await listMeasurements(studentDb, studentId))[0].weightKg).toBe(80);

    expect(await save({ measuredOn: "2026-10-01", weightKg: "79" }, true)).toEqual({
      ok: true,
      replaced: true,
    });
    const list = await listMeasurements(studentDb, studentId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ weightKg: 79, waistCm: null }); // reemplazo completo, no mezcla
  });

  it("lista de la más reciente a la más antigua", async () => {
    await save({ measuredOn: "2026-09-01", weightKg: "82" });
    await save({ measuredOn: "2026-10-01", weightKg: "80" });
    await save({ measuredOn: "2026-09-15", weightKg: "81" });
    expect((await listMeasurements(studentDb, studentId)).map((m) => m.measuredOn)).toEqual([
      "2026-10-01",
      "2026-09-15",
      "2026-09-01",
    ]);
  });

  it("el coach ve las medidas de su alumno pero no puede registrarlas; otro alumno no las ve", async () => {
    await save({ measuredOn: "2026-10-01", weightKg: "80" });
    expect(await listMeasurements(coachDb, studentId)).toHaveLength(1);
    expect(await listMeasurements(otherDb, studentId)).toEqual([]);
    expect(await save({ measuredOn: "2026-10-02", weightKg: "80" }, false, coachDb)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await save({ measuredOn: "2026-10-02", weightKg: "80" }, false, otherDb)).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("borra solo las propias", async () => {
    await save({ measuredOn: "2026-10-01", weightKg: "80" });
    const [m] = await listMeasurements(studentDb, studentId);
    expect(await deleteMeasurement({ db: otherDb, id: m.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteMeasurement({ db: coachDb, id: m.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteMeasurement({ db: studentDb, id: m.id })).toEqual({ ok: true });
    expect(await listMeasurements(studentDb, studentId)).toEqual([]);
  });
});
