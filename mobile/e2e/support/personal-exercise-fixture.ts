import { expect, type Page } from "@playwright/test";
import { setupDownloadedWeek } from "./week-fixture";
import { downloadId } from "../../../src/test/fixtures/week-download";
import {
  personalExerciseMutationSchema,
  type PersonalExerciseLibrary,
  type PersonalExerciseMutation,
} from "../../../src/lib/mobile/personal-exercise-contracts";
export async function setupOwnExercises(page: Page) {
  const week = await setupDownloadedWeek(page);
  const state = {
    value: { version: 1, userId: downloadId(1), exercises: [] } as PersonalExerciseLibrary,
    calls: [] as PersonalExerciseMutation[],
    receipts: new Map<string, unknown>(),
    lose: false,
    conflict: false,
    hold: null as Promise<void> | null,
  };
  const origin = "https://iron-strength-seven.vercel.app/api/mobile/v1";
  await page.route(origin + "/training-catalog", (route) =>
    route.fulfill({
      json: {
        version: 2,
        exercises: [
          ...week.pack.sessions[0].context.exercises.map((e) => ({
            id: e.exerciseId,
            name: e.name,
            muscleGroup: "Core",
            equipment: null,
            isBodyweight: false,
            progressionIncrementKg: 2.5,
            recordType: null,
          })),
          ...state.value.exercises
            .filter((e) => !e.archivedAt)
            .map(({ revision, archivedAt, ...e }) => e),
        ].filter((v, i, all) => all.findIndex((e) => e.id === v.id) === i),
      },
    }),
  );
  await page.route(origin + "/personal-exercises**", async (route) => {
    if (state.hold) await state.hold;
    if (route.request().method() === "GET") return route.fulfill({ json: state.value });
    const input = personalExerciseMutationSchema.parse(route.request().postDataJSON());
    state.calls.push(input);
    const previous = state.receipts.get(input.requestId);
    if (previous) return route.fulfill({ json: { ...(previous as object), duplicate: true } });
    const current = state.value.exercises.find((e) => e.id === input.targetId);
    if (
      state.conflict ||
      (input.operation !== "create" && current?.revision !== input.expectedRevision)
    )
      return route.fulfill({
        status: 409,
        json: {
          version: 1,
          error: {
            code: "conflict",
            message: "El ejercicio cambió. Conserva tus cambios y revisa la versión actual.",
          },
        },
      });
    const revision = input.expectedRevision + 1;
    if (input.operation === "create")
      state.value.exercises.push({ ...input.data, id: input.targetId, revision, archivedAt: null });
    else if (current) {
      if (input.operation === "update") Object.assign(current, input.data);
      else current.archivedAt = input.operation === "archive" ? "2026-10-28T12:00:00Z" : null;
      current.revision = revision;
    }
    const response = {
      version: 1,
      requestId: input.requestId,
      targetId: input.targetId,
      revision,
      status: { create: "created", update: "updated", archive: "archived", restore: "restored" }[
        input.operation
      ],
      duplicate: false,
    };
    state.receipts.set(input.requestId, response);
    if (state.lose) {
      state.lose = false;
      return route.fulfill({
        status: 503,
        json: {
          version: 1,
          error: { code: "unavailable", message: "No pudimos confirmar el guardado." },
        },
      });
    }
    return route.fulfill({ json: response });
  });
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Biblioteca de ejercicios", exact: true }).click();
  await page.getByRole("button", { name: "Mis ejercicios", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mis ejercicios", exact: true })).toBeVisible();
  return { state, week };
}
