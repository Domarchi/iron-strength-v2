// T98 · Flujo principal (criterio de finalización de la spec):
// invitar → registrarse → asignar → ejecutar sesión → el coach ve el progreso y comenta.
import { expect, test, type Browser } from "@playwright/test";
import { mondayOf, santiagoDate } from "../src/domain/dates";
import { COACH, admin, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";

const STUDENT = {
  email: "ana@iron-strength.e2e.test",
  name: "Ana Pérez",
  password: "Contraseña-E2E-2026!",
};

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
  await expect(coach.getByRole("heading", { name: "Sesión A", exact: true })).toBeVisible();

  // Catálogo de selección múltiple: la selección se conserva entre búsquedas.
  await coach.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  await coach.getByLabel("Buscar ejercicios").fill("Sentadilla");
  await coach.getByRole("checkbox", { name: "Sentadilla Piernas · Barra", exact: true }).check();
  await coach.getByLabel("Buscar ejercicios").fill("Press de banca");
  await coach.getByRole("checkbox", { name: "Press de banca Pecho · Barra", exact: true }).check();
  await coach.getByRole("button", { name: "Agregar seleccionados (2)", exact: true }).click();
  await expect(coach.getByLabel("Series de Sentadilla", { exact: true })).toBeVisible();

  // Edición visible, validación del lote, protección y conservación al cambiar de semana.
  await coach.getByLabel("Series de Sentadilla", { exact: true }).fill("4");
  await coach.getByLabel("Reps mín. de Press de banca", { exact: true }).fill("15");
  await coach.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(coach.getByRole("alert").filter({ hasText: "mínimo" })).toBeVisible();
  await expect(
    coach.getByRole("button", { name: "Agregar ejercicios", exact: true }),
  ).toBeDisabled();
  await coach.getByRole("button", { name: /Semana 2/ }).click();
  await expect(coach.getByRole("heading", { name: "Semana 2", exact: true })).toBeVisible();
  await coach.getByRole("button", { name: /Semana 1/ }).click();
  await expect(coach.getByLabel("Series de Sentadilla", { exact: true })).toHaveValue("4");
  await coach.getByLabel("Reps mín. de Press de banca", { exact: true }).fill("9");
  await coach.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(coach.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await coach.reload();
  await expect(coach.getByLabel("Series de Sentadilla", { exact: true })).toHaveValue("4");
  await expect(coach.getByLabel("Reps mín. de Press de banca", { exact: true })).toHaveValue("9");
  const handle = coach.getByRole("button", { name: "Reordenar Sentadilla", exact: true });
  await handle.focus();
  await handle.press("Space");
  await handle.press("ArrowDown");
  await handle.press("Enter");
  await expect(coach.getByText("Orden guardado.", { exact: true })).toBeVisible();

  // La asignación conserva la superserie y el descanso prescrito.
  await coach.getByRole("checkbox", { name: "Seleccionar Press de banca" }).check();
  await coach.getByRole("checkbox", { name: "Seleccionar Sentadilla" }).check();
  await coach.getByRole("button", { name: "Agrupar seleccionados (2)" }).click();
  await expect(coach.getByRole("heading", { name: "Superserie 1", exact: true })).toBeVisible();
  await coach.getByLabel("Descanso de Superserie 1").selectOption("120");
  await expect(coach.getByText("Configuración guardada.", { exact: true })).toBeVisible();

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
  await coach.getByText("Asignar a un alumno", { exact: true }).click();
  await coach.getByLabel("Alumno", { exact: true }).selectOption({ label: STUDENT.name });
  const today = santiagoDate(new Date());
  await coach.getByLabel("Inicio", { exact: true }).fill(mondayOf(today));
  await coach.getByRole("button", { name: "Asignar" }).click();
  await expect(coach.getByText(`Programa de ${STUDENT.name}`)).toBeVisible();

  // --- La alumna entrena su sesión ------------------------------------------------------------------------
  await student.goto("/week");
  await expect(student.getByText("Llevas 0 de 1 sesiones")).toBeVisible();
  // Base UI marca los enlaces con apariencia de botón con role="button".
  await student.getByText("Empezar", { exact: true }).click();
  await expect(student.getByRole("heading", { name: /Sesión A/ })).toBeVisible();
  await expect(student.getByRole("heading", { level: 2 })).toHaveText([
    "Press de banca",
    "Sentadilla",
  ]);
  await expect(student.getByLabel("Repeticiones de la serie 4 de Sentadilla")).toBeVisible();

  await expect(student.getByText("Superserie 1", { exact: true })).toHaveCount(2);
  await expect(student.getByLabel("Descanso automático de Sentadilla")).toHaveValue("120");

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
  await expect(student.getByRole("timer")).toBeVisible();
  await expect(student.getByLabel("Descanso automático de Press de banca")).toHaveValue("120");

  await student.getByRole("button", { name: "Finalizar entrenamiento" }).click();
  await student.getByRole("button", { name: "Sí, finalizar" }).click();
  await expect(student.getByText("¡Entrenamiento guardado!")).toBeVisible();
  await expect(student.getByText("62,5 kg × 8")).toBeVisible();
  await student.reload();
  await expect(student.getByText("62,5 kg × 8")).toBeVisible();
  const { data: profile } = await admin()
    .from("profiles")
    .select("id")
    .eq("full_name", STUDENT.name)
    .single();
  const { data: workouts } = await admin()
    .from("workouts")
    .select("id,workout_sets(*)")
    .eq("student_id", profile!.id);
  expect(workouts).toHaveLength(1);
  expect(workouts![0].workout_sets).toHaveLength(3);

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
