import type { Page } from "@playwright/test";
import { setupPersonalLibrary, libraryExercises } from "./library-fixture";
import {
  personalWorkoutPayloadSchema,
  type PersonalWorkoutPayload,
} from "../../../src/lib/mobile/personal-workout-contracts";
import { santiagoDate } from "../../../src/domain/dates";
import { downloadId } from "../../../src/test/fixtures/week-download";
import type { MobileWorkout } from "../../../src/lib/mobile/contracts";
export async function setupPersonalTraining(page: Page) {
  const library = await setupPersonalLibrary(page),
    records = new Map<string, PersonalWorkoutPayload>();
  const control = { records, calls: [] as PersonalWorkoutPayload[], loseResponse: false };
  const api = "https://iron-strength-seven.vercel.app/api/mobile/v1";
  const result = (payload: PersonalWorkoutPayload): MobileWorkout => {
    const groups = new Map<number, MobileWorkout["workout"]["exercises"][number]>();
    payload.sets.forEach((set, i) => {
      const row = groups.get(set.position) ?? {
        position: set.position,
        exerciseId: set.exerciseId,
        name: libraryExercises.find((e) => e.id === set.exerciseId)?.name ?? "Ejercicio",
        sets: [],
      };
      row.sets.push({
        id: downloadId(950 + i),
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: set.isWarmup,
      });
      groups.set(set.position, row);
    });
    return {
      version: 1,
      workout: {
        id: payload.id,
        sourceKind: payload.origin.kind,
        title: payload.title,
        programName: null,
        sessionLabel: null,
        startedAt: payload.startedAt,
        performedOn: santiagoDate(new Date(payload.startedAt)),
        durationSeconds: payload.durationSeconds,
        perceivedEffort: payload.perceivedEffort ?? null,
        note: payload.note ?? null,
        summary: {
          workingSets: payload.sets.filter((s) => !s.isWarmup).length,
          volumeKg: payload.sets
            .filter((s) => !s.isWarmup)
            .reduce((n, s) => n + s.weightKg * s.reps, 0),
          bodyweightReps: 0,
          exerciseCount: groups.size,
        },
        exercises: [...groups.values()],
      },
    };
  };
  await page.route(api + "/personal-workouts", async (route) => {
    const body = route.request().postDataJSON(),
      payload = personalWorkoutPayloadSchema.parse(body.payload);
    control.calls.push(payload);
    const duplicate = records.has(payload.id);
    records.set(payload.id, payload);
    if (control.loseResponse) {
      control.loseResponse = false;
      return route.fulfill({
        status: 503,
        json: {
          version: 1,
          error: { code: "unavailable", message: "Respuesta perdida; conservamos el registro." },
        },
      });
    }
    return route.fulfill({
      json: {
        version: 1,
        ok: true,
        status: duplicate ? "duplicate" : "created",
        workoutId: payload.id,
      },
    });
  });
  await page.route(api + "/workouts/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!,
      payload = records.get(id);
    if (!payload) return route.fallback();
    return route.fulfill({ json: result(payload) });
  });
  await page.route(api + "/workouts", (route) =>
    route.fulfill({
      json: {
        version: 1,
        nextCursor: null,
        items: [...records.values()].map((payload) => {
          const w = result(payload).workout;
          return {
            id: w.id,
            sourceKind: w.sourceKind,
            title: w.title,
            sessionLabel: null,
            startedAt: w.startedAt,
            performedOn: w.performedOn,
            durationSeconds: w.durationSeconds,
            perceivedEffort: w.perceivedEffort,
            note: w.note,
            ...w.summary,
          };
        }),
      },
    }),
  );
  await page.getByRole("button", { name: "Volver a Entrenar", exact: true }).click();
  return { ...library, control };
}
