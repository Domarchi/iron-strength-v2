// T98 · Flujo principal (criterio de finalización de la spec):
// invitar → registrarse → asignar → ejecutar sesión → el coach ve el progreso y comenta.
import { expect, test, type Browser } from "@playwright/test";
import { mondayOf, santiagoDate } from "../src/domain/dates";
import { COACH, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";

const STUDENT = { email: "ana@e2e.test", name: "Ana Pérez", password: "Contraseña-E2E-2026!" };

test.beforeAll(async () => {
  await resetAll();
  await seedCoach();
});

// El coach trabaja en escritorio y la alumna en móvil, como en la vida real.
async function newContext(browser: Browser, kind: "coach" | "student") {
  return browser.newContext(
    kind === "coach"
      ? { viewport: { width: 1280, height: 900 }, locale: "es-CL", timezoneId: "America/Santiago" }
      : {
          viewport: { width: 393, height: 851 },
          locale: "es-CL",
          timezoneId: "America/Santiago",
          isMobile: true,
          hasTouch: true,
        },
  );
}

test("invitar → registrarse → asignar → entrenar → el coach ve el progreso y comenta", async ({
  browser,
}) => {
  const coachContext = await newContext(browser, "coach");
  const coach = await coachContext.newPage();
  await login(coach, COACH.email, COACH.password);

  // --- El coach arma una plantilla de 2 semanas con una sesión y dos ejercicios ---------------------
  await coach.goto("/coach/programs");
  await coach.getByLabel("Nombre").fill("Plan E2E");
  await coach.getByLabel("Semanas").fill("2");
  await coach.getByRole("button", { name: "Crear plantilla" }).click();
  await expect(coach.getByRole("heading", { name: "Plan E2E" })).toBeVisible();

  await coach.getByRole("button", { name: "Agregar sesión" }).first().click();
  await expect(coach.getByText("Sesión A")).toBeVisible();

  for (const [search, label] of [
    ["Sentadilla", "Sentadilla · Piernas · Barra"],
    ["Press de banca", "Press de banca · Pecho · Barra"],
  ] as const) {
    // El panel queda abierto tras agregar un ejercicio: solo se abre si hace falta.
    const searchBox = coach.getByLabel("Ejercicio", { exact: true });
    if (!(await searchBox.isVisible())) await coach.getByText("Agregar ejercicio").first().click();
    await searchBox.fill(search);
    await coach.getByLabel("Resultados de la búsqueda").selectOption({ label });
    await coach.getByRole("button", { name: "Agregar a la sesión" }).click();
    await expect(coach.getByText(search, { exact: true }).first()).toBeVisible();
  }

  // --- El coach invita a la alumna ------------------------------------------------------------------------
  await coach.goto("/coach/students");
  await coach.getByLabel("Correo del alumno").fill(STUDENT.email);
  await coach.getByRole("button", { name: "Crear invitación" }).click();
  const inviteLink = await coach.getByLabel("Enlace de invitación").inputValue();
  expect(inviteLink).toContain("/invite/");

  // --- La alumna se registra con el enlace -------------------------------------------------------------
  const studentContext = await newContext(browser, "student");
  const student = await studentContext.newPage();
  await student.goto(new URL(inviteLink).pathname);
  await expect(student.getByLabel("Correo")).toHaveValue(STUDENT.email);
  await student.getByLabel("Tu nombre").fill(STUDENT.name);
  await student.getByLabel("Contraseña").fill(STUDENT.password);
  await student.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(student).toHaveURL(/\/week/);
  await expect(student.getByText("Todavía no tienes un programa asignado.")).toBeVisible();

  // --- El coach asigna el programa a la alumna, empezando esta semana -----------------------------------
  await coach.goto("/coach/programs");
  await coach.getByRole("link", { name: /Plan E2E/ }).click();
  await coach.getByLabel("Alumno").selectOption({ label: STUDENT.name });
  const today = santiagoDate(new Date());
  await coach.getByLabel("Inicio").fill(mondayOf(today));
  await coach.getByRole("button", { name: "Asignar" }).click();
  await expect(coach.getByText(`Programa de ${STUDENT.name}`)).toBeVisible();

  // --- La alumna entrena su sesión ------------------------------------------------------------------------
  await student.goto("/week");
  await expect(student.getByText("Llevas 0 de 1 sesiones")).toBeVisible();
  // Base UI marca los enlaces con apariencia de botón con role="button".
  await student.getByText("Empezar", { exact: true }).click();
  await expect(student.getByRole("heading", { name: /Sesión A/ })).toBeVisible();

  // Sentadilla: 2 series con peso y repeticiones; Press de banca: 1 serie
  await student.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
  await student.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("10");
  await student.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await student.getByLabel("Peso de la serie 2 de Sentadilla (kg)").fill("62,5");
  await student.getByLabel("Repeticiones de la serie 2 de Sentadilla").fill("8");
  await student.getByRole("button", { name: "Marcar como hecha la serie 2 de Sentadilla" }).click();
  await student.getByLabel("Peso de la serie 1 de Press de banca (kg)").fill("40");
  await student.getByLabel("Repeticiones de la serie 1 de Press de banca").fill("10");
  await student
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Press de banca" })
    .click();

  // El borrador sobrevive a una recarga
  await student.reload();
  await expect(student.getByLabel("Repeticiones de la serie 2 de Sentadilla")).toHaveValue("8");

  await student.getByRole("button", { name: "Finalizar entrenamiento" }).click();
  await student.getByRole("button", { name: "Sí, finalizar" }).click();
  await expect(student.getByText("¡Entrenamiento guardado!")).toBeVisible();
  await expect(student.getByText("62,5 kg × 8")).toBeVisible();

  // --- El coach ve el avance y comenta --------------------------------------------------------------------
  await coach.goto("/coach/students");
  const row = coach.getByRole("link", { name: new RegExp(STUDENT.name) });
  await expect(row).toContainText("1 de 1 sesiones");
  await row.click();
  await expect(coach.getByRole("heading", { name: STUDENT.name })).toBeVisible();
  await expect(coach.getByText("Sentadilla").first()).toBeVisible(); // en "Mejores marcas"

  await coach.getByRole("link", { name: /Sesión A · 3 series/ }).click();
  await coach
    .getByLabel("Escribe un comentario")
    .fill("Muy bien. La próxima semana subimos 2,5 kg.");
  await coach.getByRole("button", { name: "Publicar comentario" }).click();
  await expect(coach.getByText("Muy bien. La próxima semana subimos 2,5 kg.")).toBeVisible();

  // --- La alumna lee el comentario de su coach --------------------------------------------------------------
  await student.goto("/history");
  await student.getByRole("link", { name: /Sesión A/ }).click();
  await expect(student.getByText("Muy bien. La próxima semana subimos 2,5 kg.")).toBeVisible();
  await expect(student.getByText("Coach", { exact: true })).toBeVisible();

  await coachContext.close();
  await studentContext.close();
});
