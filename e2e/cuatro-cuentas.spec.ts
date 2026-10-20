import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";
async function train(page: Page, sessionId: string, note: string, kg: number) {
  await page.goto(`/workout/${sessionId}`);
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill(String(kg));
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("8");
  await page
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByLabel("Esfuerzo percibido (opcional)", { exact: true }).selectOption("7");
  await page.getByLabel("Nota del entrenamiento (opcional)", { exact: true }).fill(note);
  await page.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
  await expect(page.getByText("¡Entrenamiento guardado!", { exact: true })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
test("un coach y tres alumnos entrenan, conservan privacidad y reciben comentarios del coach (T164)", async ({
  browser,
  page,
  baseURL,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const own = await seedProgram({ coachId, studentId: coachId });
  const students = [];
  for (const [i, name] of ["Ana", "Bruno", "Carla"].entries()) {
    const credentials = {
      email: `cuatro-${i}@iron-strength.e2e.test`,
      password: "Prueba-Cuatro-2026!",
    };
    const id = await createUser(admin(), { ...credentials, name, role: "student", coachId });
    const program = await seedProgram({ coachId, studentId: id });
    students.push({ ...credentials, name, id, sessionId: program.sessionId });
  }
  const contexts: BrowserContext[] = [];
  try {
    await login(page, COACH.email, COACH.password);
    const coachWorkout = await train(page, own.sessionId, "Registro propio del coach", 70);
    const records: { page: Page; workoutId: string; note: string; name: string }[] = [];
    for (const [i, student] of students.entries()) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
        locale: "es-CL",
        timezoneId: "America/Santiago",
      });
      contexts.push(context);
      const mobile = await context.newPage();
      await login(mobile, student.email, student.password);
      const note = `Registro privado de ${student.name}`;
      const workoutId = await train(mobile, student.sessionId, note, 40 + i * 5);
      records.push({ page: mobile, workoutId, note, name: student.name });
    }
    for (const [i, record] of records.entries()) {
      const other = records[(i + 1) % records.length];
      for (const privateId of [other.workoutId, coachWorkout]) {
        await record.page.goto(`/history/${privateId}`);
        // Next puede transmitir el layout con 200 antes de resolver notFound.
        await expect(
          record.page.getByRole("heading", { name: "No encontramos esa página" }),
        ).toBeVisible();
        await expect(record.page.getByText(other.note, { exact: true })).toHaveCount(0);
        await expect(
          record.page.getByText("Registro propio del coach", { exact: true }),
        ).toHaveCount(0);
      }
      await record.page.goto("/history");
      await expect(record.page.locator(`a[href="/history/${other.workoutId}"]`)).toHaveCount(0);
      await page.goto(`/history/${record.workoutId}`);
      await expect(page.getByText(record.note, { exact: true })).toBeVisible();
      const reply = `Buen registro, ${record.name}. Mantén la técnica.`;
      await page.getByLabel("Escribe un comentario").fill(reply);
      await page.getByRole("button", { name: "Publicar comentario", exact: true }).click();
      await expect(page.getByText(reply, { exact: true })).toBeVisible();
      await record.page.goto(`/history/${record.workoutId}`);
      await expect(record.page.getByText(reply, { exact: true })).toBeVisible();
    }
    const { data, error } = await admin()
      .from("workouts")
      .select("student_id, perceived_effort, note, workout_sets(weight_kg,reps)");
    expect(error).toBeNull();
    expect(data).toHaveLength(4);
    expect(new Set(data!.map((w) => w.student_id)).size).toBe(4);
    expect(
      data!.every(
        (w) =>
          w.perceived_effort === 7 && w.workout_sets.length === 1 && w.workout_sets[0].reps === 8,
      ),
    ).toBe(true);
  } finally {
    for (const context of contexts) await context.close();
  }
});
