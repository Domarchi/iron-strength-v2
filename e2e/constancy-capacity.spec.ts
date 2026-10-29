import { expect, test } from "@playwright/test";
import { addDays } from "../src/domain/dates";
import { admin, resetAll, seedCoach, seedProgram, createUser, COACH } from "./support/db";
import { login, logout } from "./support/ui";
const account = {
  email: "constancy-capacity@iron-strength.e2e.test",
  password: "Constancy-local-only-2026!",
  name: "Alumno Constancia",
};
test.afterAll(async () => {
  await resetAll();
});
test("fallo de capacidad de constancia no inventa logros ni bloquea rutina/ficha y permite reintentar", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetAll();
  const coachId = await seedCoach();
  const owner = await createUser(admin(), { ...account, role: "student", coachId });
  await seedProgram({ coachId, studentId: owner });
  const archivedIds: string[] = [];
  for (let from = 0; from < 10000; from += 200) {
    expect(
      (
        await admin()
          .from("programs")
          .insert(
            Array.from({ length: 200 }, (_, i) => {
              const start = addDays("1800-01-06", (from + i) * 7);
              const id = crypto.randomUUID();
              archivedIds.push(id);
              return {
                id,
                coach_id: coachId,
                student_id: owner,
                name: "Archivo constancia",
                weeks_count: 1,
                start_date: start,
                ends_on: addDays(start, 6),
              };
            }),
          )
      ).error,
    ).toBeNull();
  }
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/students/${owner}?semanas=12`);
  await expect(page.getByRole("heading", { name: account.name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "La constancia supera el límite" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Programas", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Logros/ })).toHaveCount(0);
  const retry = page.getByRole("link", { name: "Reintentar constancia", exact: true });
  await expect(retry).toHaveAttribute("href", `/coach/students/${owner}?semanas=12`);
  await retry.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "La constancia supera el límite" }),
  ).toBeVisible();
  await logout(page);
  await login(page, account.email, account.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Ver rutina de sesión A", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Rutina de sesión A", exact: true });
  await expect(preview.getByText("Sentadilla", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Cerrar vista previa", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "La constancia supera el límite" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Aún sin racha|Racha:/ })).toHaveCount(0);
  // The archived programs are test-only. Removing them proves recovery from the same retry action.
  for (let from = 0; from < archivedIds.length; from += 200) {
    expect(
      (
        await admin()
          .from("programs")
          .delete()
          .eq("student_id", owner)
          .eq("name", "Archivo constancia")
          .in("id", archivedIds.slice(from, from + 200))
      ).error,
    ).toBeNull();
  }
  await page.getByRole("link", { name: "Reintentar constancia", exact: true }).click();
  await expect(page.getByRole("link", { name: /Aún sin racha|Racha:/ })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "La constancia supera el límite" }),
  ).toHaveCount(0);
});
