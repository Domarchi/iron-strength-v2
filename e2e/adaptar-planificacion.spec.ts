import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { COACH, admin, createUser, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
import { mondayOf, santiagoDate } from "../src/domain/dates";
let programId: string, studentId: string, names: string[];
test.beforeEach(async () => {
  await resetAll();
  const coachId = await seedCoach();
  studentId = await createUser(admin(), {
    role: "student",
    name: "Alumno Flujo",
    email: "flow-a@iron-strength.e2e.test",
    password: "Prueba-Flujo-2026!",
    coachId,
  });
  const ex = await admin()
    .from("exercises")
    .select("id,name")
    .is("coach_id", null)
    .order("name")
    .limit(7);
  expect(ex.error).toBeNull();
  names = ex.data!.slice(0, 6).map((e) => e.name);
  const p = await admin()
    .from("programs")
    .insert({ coach_id: coachId, name: "Base cuatro semanas", weeks_count: 4 })
    .select("id")
    .single();
  expect(p.error).toBeNull();
  programId = p.data!.id;
  const sessions = await admin()
    .from("program_sessions")
    .insert(
      Array.from({ length: 4 }, (_, i) =>
        ["A", "B", "C"].map((label, position) => ({
          program_id: programId,
          week_number: i + 1,
          label,
          position,
          title: `Tren ${label}`,
          weekday: position * 2,
        })),
      ).flat(),
    )
    .select("id");
  expect(sessions.error).toBeNull();
  for (const s of sessions.data!) {
    const group = crypto.randomUUID();
    const rows = await admin()
      .from("session_exercises")
      .insert(
        ex.data!.slice(0, 6).map((e, position) => ({
          program_session_id: s.id,
          exercise_id: e.id,
          position,
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          target_weight_kg: 50,
          note: "Conservar técnica",
          rest_seconds: 90,
          superset_id: position < 2 ? group : null,
          superset_rest_seconds: position < 2 ? 120 : null,
        })),
      )
      .select("id,position");
    expect(rows.error).toBeNull();
    const alt = await admin()
      .from("session_exercise_alternatives")
      .insert({
        session_exercise_id: rows.data!.find((r) => r.position === 0)!.id,
        exercise_id: ex.data![6].id,
        position: 0,
        sets: 2,
        reps_min: 6,
        reps_max: 10,
        target_weight_kg: 20,
      });
    expect(alt.error).toBeNull();
  }
});
async function snapshot(id = programId) {
  const { data, error } = await admin()
    .from("programs")
    .select("*,program_sessions(*,session_exercises(*,session_exercise_alternatives(*)))")
    .eq("id", id)
    .single();
  expect(error).toBeNull();
  return data!;
}
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/programs/${programId}?alumno=${studentId}`);
}
async function copyReview(page: Page, weeks = [2, 3]) {
  await page.getByText("Copiar semana a varias", { exact: true }).click();
  for (const week of weeks)
    await page.getByRole("checkbox", { name: `Semana ${week}`, exact: true }).check();
  await page.getByRole("button", { name: "Revisar copia", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Vista previa de copia", exact: true }),
  ).toBeVisible();
  for (const week of weeks)
    await page.getByRole("checkbox", { name: `Reemplazar semana ${week}`, exact: true }).check();
}
test("adaptar desde la ficha conserva alumno y crea una base independiente", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const before = await snapshot();
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/students/${studentId}`);
  await page.getByRole("button", { name: "Asignar un programa", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/programs/adapt\\?alumno=${studentId}`));
  await page.getByLabel("Buscar una base", { exact: true }).fill("Base cuatro semanas");
  await page.getByRole("button", { name: "Usar Base cuatro semanas", exact: true }).click();
  await page.getByLabel("Nombre de la copia", { exact: true }).fill("Plan del alumno");
  await page.getByRole("button", { name: "Crear copia", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan del alumno", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("alumno")).toBe(studentId);
  await page.getByText("Asignar a un alumno", { exact: true }).click();
  await expect(page.getByLabel("Alumno", { exact: true })).toHaveValue(studentId);
  expect(await snapshot()).toEqual(before);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
});
test("adaptación de 72 pesos incluye revisión y reduce al menos 30 % las acciones (T170/T177)", async ({
  page,
}) => {
  const original = await snapshot();
  await open(page);
  let actions = 0;
  const click = async (l: ReturnType<Page["getByRole"]>) => {
    actions++;
    await l.click();
  };
  const fill = async (l: ReturnType<Page["getByLabel"]>, value: string) => {
    actions++;
    await l.fill(value);
  };
  const check = async (name: string) => {
    actions++;
    await page.getByRole("checkbox", { name, exact: true }).check();
  };
  await click(page.getByText("Duplicar programa", { exact: true }));
  await fill(page.getByLabel("Nombre de la copia", { exact: true }), "Plan adaptado");
  await click(page.getByRole("button", { name: "Crear copia", exact: true }));
  await expect(page.getByRole("heading", { name: "Plan adaptado", exact: true })).toBeVisible();
  const copyId = new URL(page.url()).pathname.split("/").at(-1)!;
  for (const label of ["A", "B", "C"]) {
    if (label !== "A")
      await click(page.getByRole("button", { name: new RegExp(`^Sesión ${label}`) }));
    for (const name of names)
      await fill(
        page.getByLabel(`Peso (kg) de ${name}`, { exact: true }).filter({ visible: true }),
        "77.5",
      );
    await click(page.getByRole("button", { name: "Guardar sesión", exact: true }));
    await expect(
      page.getByText("Cambios guardados.", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  }
  await click(page.getByText("Copiar semana a varias", { exact: true }));
  for (const week of [2, 3, 4]) await check(`Semana ${week}`);
  await click(page.getByRole("button", { name: "Revisar copia", exact: true }));
  for (const week of [2, 3, 4]) await check(`Reemplazar semana ${week}`);
  await click(page.getByRole("button", { name: "Confirmar copia de semanas", exact: true }));
  await expect(page.getByText("Copia de semanas confirmada.", { exact: true })).toBeVisible();
  await click(page.getByText("Asignar a un alumno", { exact: true }));
  await expect(page.getByLabel("Alumno", { exact: true })).toHaveValue(studentId);
  await fill(page.getByLabel("Inicio", { exact: true }), mondayOf(santiagoDate(new Date())));
  await click(page.getByRole("button", { name: "Revisar asignación", exact: true }));
  const review = page.getByRole("region", { name: "Vista previa de asignación", exact: true });
  await expect(review).toContainText("Alumno Flujo");
  await expect(review).toContainText("12 sesiones");
  await click(page.getByRole("button", { name: "Confirmar asignación", exact: true }));
  await expect(page.getByText("Programa de Alumno Flujo", { exact: true })).toBeVisible();
  const assignedId = new URL(page.url()).pathname.split("/").at(-1)!;
  await click(page.getByRole("button", { name: /^Semana 2/ }));
  const assigned = await snapshot(assignedId),
    copy = await snapshot(copyId);
  const rows = assigned.program_sessions.flatMap((s) => s.session_exercises);
  expect(rows).toHaveLength(72);
  expect(rows.every((e) => e.target_weight_kg === 77.5 && e.note === "Conservar técnica")).toBe(
    true,
  );
  expect(
    copy.program_sessions
      .flatMap((s) => s.session_exercises)
      .every((e) => e.target_weight_kg === 77.5),
  ).toBe(true);
  const originalIds = new Set(
    original.program_sessions.flatMap((s) => s.session_exercises).map((e) => e.id),
  );
  expect(rows.every((e) => !originalIds.has(e.id))).toBe(true);
  const groups = rows.filter((e) => e.superset_id).map((e) => e.superset_id);
  expect(new Set(groups).size).toBe(12);
  const alternatives = rows.flatMap((e) => e.session_exercise_alternatives);
  expect(alternatives).toHaveLength(12);
  expect(alternatives.every((a) => a.target_weight_kg === 20)).toBe(true);
  expect(await snapshot()).toEqual(original);
  expect(actions).toBeLessThanOrEqual(66);
  expect((95 - actions) / 95).toBeGreaterThanOrEqual(0.3);
  const report = {
    baseline: 95,
    actual: actions,
    reductionPercent: (100 * (95 - actions)) / 95,
    fixture: "4 semanas idénticas; 3 sesiones × 6 ejercicios por semana",
  };
  const reportPath = test.info().outputPath("acciones-adaptacion.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await test
    .info()
    .attach("acciones-adaptacion.json", { path: reportPath, contentType: "application/json" });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
});
test("copia múltiple conserva su intento con cuota llena y confirma respuesta perdida tras recargar", async ({
  page,
}) => {
  await open(page);
  await copyReview(page);
  const before = await snapshot();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.assign(window, {
      restorePlanningStorage: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Confirmar copia de semanas", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No se pudo proteger la petición" }),
  ).toBeVisible();
  expect(await snapshot()).toEqual(before);
  await page.evaluate(() =>
    (window as typeof window & { restorePlanningStorage: () => void }).restorePlanningStorage(),
  );
  let lost = false;
  await page.route(page.url(), async (route) => {
    if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      lost = true;
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Confirmar copia de semanas", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No recibimos confirmación" }),
  ).toBeVisible();
  const committed = await snapshot();
  expect(committed).not.toEqual(before);
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Confirmar copia de semanas", exact: true }).click();
  await expect(page.getByText("Copia de semanas confirmada.", { exact: true })).toBeVisible();
  expect(await snapshot()).toEqual(committed);
});
test("la revisión de copia detecta un cambio remoto sin modificar otro destino", async ({
  page,
}) => {
  await open(page);
  await copyReview(page);
  const before = await snapshot();
  const destination = before.program_sessions.find((s) => s.week_number === 3 && s.label === "A")!;
  await admin()
    .from("session_exercises")
    .update({ note: "Nota remota" })
    .eq("id", destination.session_exercises[0].id);
  const changed = await snapshot();
  await page.getByRole("button", { name: "Confirmar copia de semanas", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "cambió desde la revisión" }),
  ).toBeVisible();
  expect(await snapshot()).toEqual(changed);
  await expect(page.getByRole("checkbox", { name: "Semana 2", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Semana 3", exact: true })).toBeChecked();
});
test("asignar tras perder la respuesta confirma la misma copia y el mismo alumno", async ({
  page,
}) => {
  await open(page);
  await page.getByText("Asignar a un alumno", { exact: true }).click();
  await expect(page.getByLabel("Alumno", { exact: true })).toHaveValue(studentId);
  await page.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  let lost = false;
  await page.route(page.url(), async (route) => {
    if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      lost = true;
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Confirmar asignación", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No recibimos confirmación" }),
  ).toBeVisible();
  const programs = await admin().from("programs").select("id").eq("student_id", studentId);
  expect(programs.data).toHaveLength(1);
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Confirmar asignación", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/programs/${programs.data![0].id}`));
  expect((await admin().from("programs").select("id").eq("student_id", studentId)).data).toEqual(
    programs.data,
  );
});
