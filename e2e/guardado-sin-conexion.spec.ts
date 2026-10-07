// T99 · RF-24: si se corta la red al finalizar, no se pierde nada ni se duplica al reintentar.
import { expect, test } from "@playwright/test";
import { admin, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";

const STUDENT = { email: "luz@e2e.test", name: "Luz Soto", password: "Contraseña-E2E-2026!" };

test("sin conexión al finalizar: el entrenamiento queda a salvo y se guarda una sola vez al volver la red", async ({
  page,
  context,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const studentId = await createUser(admin(), { role: "student", ...STUDENT, coachId });
  await seedProgram({ coachId, studentId });

  await login(page, STUDENT.email, STUDENT.password);
  await page.goto("/week");
  await page.getByText("Empezar", { exact: true }).click();

  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("10");
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();

  // Se corta la red justo antes de finalizar
  await context.setOffline(true);
  await page.getByRole("button", { name: "Finalizar entrenamiento" }).click();
  await page.getByRole("button", { name: "Sí, finalizar" }).click();

  await expect(page.getByText("Tu entrenamiento terminó, pero no se guardó")).toBeVisible();
  await expect(page.getByText(/No hay conexión con el servidor/)).toBeVisible();
  const { count: beforeRetry } = await admin()
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  expect(beforeRetry).toBe(0);

  // Aunque se recargue la página, el entrenamiento terminado sigue ahí
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText("Tu entrenamiento terminó, pero no se guardó")).toBeVisible();

  // Vuelve la conexión: el reintento guarda una sola vez
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByText("¡Entrenamiento guardado!")).toBeVisible();

  const { count } = await admin()
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  expect(count).toBe(1);
  const { count: sets } = await admin()
    .from("workout_sets")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  expect(sets).toBe(1);

  // Y el borrador local ya no existe: volver a la sesión empieza una nueva (no reenvía la anterior)
  const leftovers = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("is:draft:")),
  );
  expect(leftovers).toEqual([]);
});
