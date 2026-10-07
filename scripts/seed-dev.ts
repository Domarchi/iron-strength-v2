// Datos de desarrollo: un coach y dos alumnos de prueba en la base LOCAL. Idempotente.
// Se niega a correr contra cualquier base que no sea local. Uso: npm run dev:seed
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";
const host = url ? new URL(url).hostname : "";
if (!["127.0.0.1", "localhost"].includes(host) || !key) {
  console.error("dev:seed solo corre contra Supabase local (revisa .env.local).");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const password = process.env.E2E_COACH_PASSWORD ?? "Local-E2E-only-2026!";

type Person = { email: string; name: string; role: "coach" | "student" };
const people: Person[] = [
  {
    email: process.env.E2E_COACH_EMAIL ?? "coach-e2e@test.local",
    name: "Coach E2E",
    role: "coach",
  },
  { email: "alumno1-e2e@test.local", name: "Alumno Uno", role: "student" },
  { email: "alumno2-e2e@test.local", name: "Alumno Dos", role: "student" },
];

const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const byEmail = new Map(existing?.users.map((u) => [u.email, u.id]));
let coachId: string | undefined;

for (const person of people) {
  let id = byEmail.get(person.email);
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser falló");
    id = data.user.id;
  }
  if (person.role === "coach") coachId = id;

  const { error } = await admin.from("profiles").upsert({
    id,
    role: person.role,
    full_name: person.name,
    coach_id: person.role === "coach" ? id : coachId!,
  });
  if (error) throw error;
  console.log(`${person.role.padEnd(7)} ${person.email}`);
}

// Programa de ejemplo para el primer alumno: 3 semanas desde el lunes de esta semana.
const { mondayOf, santiagoDate, addDays } = await import("../src/domain/dates.ts");
const { data: students } = await admin
  .from("profiles")
  .select("id")
  .eq("full_name", "Alumno Uno")
  .limit(1);
const studentId = students?.[0]?.id;

if (studentId && coachId) {
  const { count } = await admin
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);

  if (!count) {
    const start = mondayOf(santiagoDate(new Date()));
    const { data: program, error: programError } = await admin
      .from("programs")
      .insert({
        coach_id: coachId,
        student_id: studentId,
        name: "Fuerza base",
        weeks_count: 3,
        start_date: start,
        ends_on: addDays(start, 20),
      })
      .select("id")
      .single();
    if (programError) throw programError;

    const names = ["Sentadilla", "Press de banca", "Dominadas", "Peso muerto rumano"];
    const { data: exercises } = await admin
      .from("exercises")
      .select("id, name")
      .in("name", names)
      .is("coach_id", null);
    const byName = new Map(exercises?.map((e) => [e.name, e.id]));

    const { data: sessions } = await admin
      .from("program_sessions")
      .insert([
        { program_id: program.id, week_number: 1, label: "A" },
        { program_id: program.id, week_number: 1, label: "B" },
        { program_id: program.id, week_number: 2, label: "A" },
        { program_id: program.id, week_number: 2, label: "B" },
      ])
      .select("id, week_number, label");

    const rows = (sessions ?? []).flatMap((s) =>
      (s.label === "A"
        ? ["Sentadilla", "Press de banca"]
        : ["Peso muerto rumano", "Dominadas"]
      ).map((name, i) => ({
        program_session_id: s.id,
        exercise_id: byName.get(name)!,
        position: i,
        sets: 3,
        reps_min: 8,
        reps_max: name === "Dominadas" ? 8 : 12,
        target_weight_kg: name === "Sentadilla" ? 60 : null,
      })),
    );
    const { error } = await admin.from("session_exercises").insert(rows);
    if (error) throw error;
    console.log("programa  Fuerza base (3 semanas) asignado a Alumno Uno");
  }
}

// Historial de ejemplo (solo si el alumno no tiene entrenamientos): sentadilla y press en progresión.
if (studentId) {
  const { count: workoutCount } = await admin
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);

  if (!workoutCount) {
    const { data: ex } = await admin
      .from("exercises")
      .select("id, name")
      .in("name", ["Sentadilla", "Press de banca"])
      .is("coach_id", null);
    const squat = ex!.find((e) => e.name === "Sentadilla")!.id;
    const bench = ex!.find((e) => e.name === "Press de banca")!.id;
    const today = santiagoDate(new Date());

    const plan = [
      { ago: 35, squat: [55, 55, 55], bench: [40, 40, 40], reps: [10, 9, 8] },
      { ago: 28, squat: [57.5, 57.5, 57.5], bench: [40, 40, 40], reps: [10, 10, 9] },
      { ago: 21, squat: [60, 60, 60], bench: [42.5, 42.5, 42.5], reps: [10, 9, 9] },
      { ago: 14, squat: [60, 60, 60], bench: [42.5, 42.5, 42.5], reps: [12, 11, 10] },
      { ago: 10, squat: [62.5, 62.5, 62.5], bench: [45, 45, 45], reps: [10, 9, 8] },
      { ago: 3, squat: [65, 65, 65], bench: [45, 45, 45], reps: [10, 9, 9] },
    ];
    for (const w of plan) {
      const startedAt = new Date(`${addDays(today, -w.ago)}T15:00:00Z`).toISOString();
      const id = crypto.randomUUID();
      await admin.from("workouts").insert({
        id,
        student_id: studentId,
        session_label: "A",
        started_at: startedAt,
        finished_at: new Date(Date.parse(startedAt) + 3_000_000).toISOString(),
        duration_seconds: 3000,
        created_at: startedAt,
      });
      const rows = [
        ...w.squat.map((kg, i) => ({
          exerciseId: squat,
          name: "Sentadilla",
          position: 0,
          n: i + 1,
          kg,
          reps: w.reps[i],
        })),
        ...w.bench.map((kg, i) => ({
          exerciseId: bench,
          name: "Press de banca",
          position: 1,
          n: i + 1,
          kg,
          reps: w.reps[i],
        })),
      ];
      const { error } = await admin.from("workout_sets").insert(
        rows.map((r) => ({
          workout_id: id,
          student_id: studentId,
          exercise_id: r.exerciseId,
          exercise_name: r.name,
          position: r.position,
          set_number: r.n,
          weight_kg: r.kg,
          reps: r.reps,
          is_warmup: false,
        })),
      );
      if (error) throw error;
    }
    console.log("historial 6 entrenamientos de ejemplo para Alumno Uno");
  }
}
