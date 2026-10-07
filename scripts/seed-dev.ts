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
