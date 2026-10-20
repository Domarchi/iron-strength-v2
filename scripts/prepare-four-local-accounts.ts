// Preparación aditiva del entorno manual. Nunca borra perfiles, rutinas ni entrenamientos.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.ts";
import { mondayOf, santiagoDate } from "../src/domain/dates.ts";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !secret || !publicKey)
  throw new Error("Solo se permite una instancia local con sus claves configuradas.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient<Database>(url, secret, options);
const { data: coach, error: coachError } = await db
  .from("profiles")
  .select("id")
  .eq("role", "coach")
  .single();
if (coachError || !coach) throw new Error("Primero prepara el coach local existente.");
const { data: auth, error: authError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const coachEmail = auth.users.find((u) => u.id === coach.id)?.email;
if (!coachEmail) throw new Error("No se encontró el acceso del coach local.");
// La misma credencial configurada para la semilla local; nunca se cambia una contraseña existente.
const password = process.env.E2E_COACH_PASSWORD ?? "Local-E2E-only-2026!";
const signed = createClient<Database>(url, publicKey, options);
const { error: loginError } = await signed.auth.signInWithPassword({ email: coachEmail, password });
if (loginError)
  throw new Error(
    "La credencial configurada no permite entrar como coach. No se modificaron datos.",
  );
const { data: template, error: templateError } = await signed
  .from("programs")
  .select("id")
  .eq("coach_id", coach.id)
  .is("student_id", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (templateError || !template)
  throw new Error("Se necesita una plantilla del coach para preparar las cuentas.");
const { data: students, error: studentError } = await db
  .from("profiles")
  .select("id")
  .eq("coach_id", coach.id)
  .eq("role", "student");
if (studentError) throw studentError;
let added = 0,
  assigned = 0;
const ids = students.map((p) => p.id);
for (let n = ids.length + 1; n <= 3; n++) {
  const email = `alumno${n}-e2e@test.local`;
  let userId = auth.users.find((u) => u.email === email)?.id;
  if (userId) {
    const { data: existing, error } = await db
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (existing)
      throw new Error("El correo de prueba ya pertenece a otro perfil. Se conservó sin modificar.");
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("No se pudo crear el acceso local adicional.");
    userId = data.user.id;
  }
  const { error } = await db.from("profiles").insert({
    id: userId,
    role: "student",
    full_name: ["", "Alumno Uno", "Alumno Dos", "Alumno Tres"][n],
    coach_id: coach.id,
  });
  if (error) throw error;
  ids.push(userId);
  added++;
}
const startDate = mondayOf(santiagoDate(new Date()));
for (const studentId of [coach.id, ...ids]) {
  // Conservar cualquier programa vigente, que termina esta semana o futuro.
  const { count, error } = await db
    .from("programs")
    .select("id", { head: true, count: "exact" })
    .eq("student_id", studentId)
    .gte("ends_on", startDate);
  if (error) throw error;
  if (count) continue;
  const { error: assignError } = await signed.rpc("assign_program", {
    p_template_id: template.id,
    p_student_id: studentId,
    p_start_date: startDate,
  });
  if (assignError)
    throw new Error(`No se pudo asignar una copia de la plantilla local: ${assignError.message}`);
  assigned++;
}
await signed.auth.signOut({ scope: "local" });
console.log(
  `Preparación local: ${added} alumnos añadidos, ${assigned} copias de programa asignadas. Perfiles y programas existentes conservados.`,
);
