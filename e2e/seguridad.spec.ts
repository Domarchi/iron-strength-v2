// T100 · Seguridad: un alumno no accede a /coach ni a datos de otro alumno ni a fotos ajenas;
// un usuario desactivado es expulsado; una foto inválida se rechaza (RF-8, RF-43, RF-44).
import { expect, test } from "@playwright/test";
import { admin, createUser, resetAll, seedCoach, seedWorkout } from "./support/db";
import { login } from "./support/ui";

const ANA = { email: "ana-sec@e2e.test", name: "Ana", password: "Contraseña-E2E-2026!" };
const BEA = { email: "bea-sec@e2e.test", name: "Bea", password: "Contraseña-E2E-2026!" };

let coachId: string;
let anaId: string;
let beaId: string;
let beaWorkoutId: string;
let benchId: string;

test.beforeAll(async () => {
  await resetAll();
  coachId = await seedCoach();
  anaId = await createUser(admin(), { role: "student", ...ANA, coachId });
  beaId = await createUser(admin(), { role: "student", ...BEA, coachId });
  const { data } = await admin()
    .from("exercises")
    .select("id")
    .eq("name", "Press de banca")
    .is("coach_id", null)
    .single();
  benchId = data!.id;
  beaWorkoutId = await seedWorkout({
    studentId: beaId,
    exerciseId: benchId,
    exerciseName: "Press de banca",
    daysAgo: 2,
  });
});

test("sin sesión, todo redirige al login", async ({ page }) => {
  for (const path of ["/week", "/history", "/progress", "/body", "/coach/students"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("un alumno no entra al área del coach", async ({ page }) => {
  await login(page, ANA.email, ANA.password);
  for (const path of ["/coach/students", "/coach/programs", "/coach/exercises"]) {
    await page.goto(path);
    // Con streaming Next responde 200 y pinta la pantalla de "no encontrada": lo importante es que
    // no se muestre nada del área del coach.
    await expect(page.getByText("No encontramos esa página")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Alumnos|Programas|Ejercicios/ })).toHaveCount(
      0,
    );
  }
});

test("un alumno no ve los entrenamientos, el progreso ni las medidas de otro alumno", async ({
  page,
}) => {
  await login(page, ANA.email, ANA.password);

  await page.goto(`/history/${beaWorkoutId}`);
  await expect(page.getByText("No encontramos esa página")).toBeVisible();
  await expect(page.getByText("Press de banca")).toHaveCount(0);

  // El parámetro ?alumno= solo lo respeta el coach: para un alumno se ignora y no hay datos propios
  await page.goto(`/progress/${benchId}?alumno=${beaId}`);
  await expect(page.getByText("No encontramos esa página")).toBeVisible();

  await page.goto(`/body?alumno=${beaId}`);
  await expect(page.getByRole("heading", { name: "Cuerpo" })).toBeVisible(); // su propia pantalla, no la de Bea
  await expect(page.getByText("Aún no registras medidas")).toBeVisible();
});

test("las fotos de un alumno no las ve otro alumno ni son públicas", async ({ page }) => {
  // Bea tiene una foto guardada (subida como service role para no depender de la interfaz)
  const path = `${beaId}/foto.webp`;
  await admin()
    .storage.from("progress-photos")
    .upload(path, new Uint8Array(500).fill(1), { contentType: "image/webp", upsert: true });
  await admin()
    .from("progress_photos")
    .insert({ student_id: beaId, taken_on: "2026-10-01", storage_path: path, size_bytes: 500 });

  // La galería de Ana no incluye la foto de Bea
  await login(page, ANA.email, ANA.password);
  await page.goto("/body");
  await expect(page.getByText("Todavía no hay fotos de progreso.")).toBeVisible();
  await expect(page.locator("img[alt^='Foto de progreso']")).toHaveCount(0);

  // El bucket es privado: sin enlace firmado la URL pública no entrega el archivo
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/progress-photos/${path}`;
  expect((await page.request.get(publicUrl)).status()).toBeGreaterThanOrEqual(400);
});

test("un archivo que no es una imagen se rechaza con un mensaje claro", async ({ page }) => {
  await login(page, ANA.email, ANA.password);
  await page.goto("/body");
  await page.getByLabel("Foto", { exact: true }).setInputFiles({
    name: "no-es-foto.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("esto es texto, no una imagen"),
  });
  await page.getByRole("button", { name: "Subir foto" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /imagen válida|no se pudo leer/i }),
  ).toBeVisible();

  const { count } = await admin()
    .from("progress_photos")
    .select("id", { count: "exact", head: true })
    .eq("student_id", anaId);
  expect(count).toBe(0);
});

test("un alumno desactivado con la sesión abierta es expulsado y no puede volver a entrar", async ({
  page,
}) => {
  await login(page, BEA.email, BEA.password);
  await expect(page).toHaveURL(/\/week/);

  await admin().from("profiles").update({ is_active: false }).eq("id", beaId);

  await page.goto("/week");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/sesión terminó o tu cuenta está desactivada/i)).toBeVisible();

  await page.getByLabel("Correo").fill(BEA.email);
  await page.getByLabel("Contraseña").fill(BEA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /desactivada/i })).toBeVisible();

  await admin().from("profiles").update({ is_active: true }).eq("id", beaId);
});
