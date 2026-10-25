import { expect, type Page } from "@playwright/test";
import { downloadId, weekDownloadFixture } from "../../../src/test/fixtures/week-download";
import type { WorkoutPayload } from "../../../src/lib/workout/runner-state";
import type { MobileWorkout } from "../../../src/lib/mobile/contracts";
const origin = "https://iron-strength-seven.vercel.app",
  userId = downloadId(1);
export async function enterWeekUser(page: Page) {
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Synthetic-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Hola, Ana", { exact: true })).toBeVisible();
}
export async function setupDownloadedWeek(page: Page, timestamp = "2026-10-24T12:00:00Z") {
  await page.clock.setFixedTime(new Date("2026-10-24T15:00:00Z"));
  const control = {
    waiting: null as Promise<void> | null,
    lost: false,
    offline: false,
    saveLost: false,
    requests: 0,
    pack: weekDownloadFixture(userId, timestamp),
    saved: new Map<string, WorkoutPayload>(),
    saveRequests: [] as WorkoutPayload[],
    calls: [] as string[],
  };
  function result(payload: WorkoutPayload): MobileWorkout {
    const groups = new Map<number, MobileWorkout["workout"]["exercises"][number]>();
    payload.sets.forEach((set, i) => {
      const prescribed = control.pack.sessions[0].context.exercises[set.position];
      const row = groups.get(set.position) ?? {
        position: set.position,
        exerciseId: set.exerciseId,
        name: set.exerciseName,
        prescribedExerciseId: set.prescribedExerciseId,
        prescribedExerciseName: prescribed?.name ?? null,
        sets: [],
      };
      row.sets.push({
        id: downloadId(200 + i),
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: set.isWarmup,
      });
      groups.set(set.position, row);
    });
    const working = payload.sets.filter((s) => !s.isWarmup);
    return {
      version: 1,
      workout: {
        id: payload.id,
        programName: control.pack.program.name,
        sessionLabel: payload.sessionLabel,
        startedAt: payload.startedAt,
        performedOn: payload.startedAt.slice(0, 10),
        durationSeconds: payload.durationSeconds,
        perceivedEffort: payload.perceivedEffort ?? null,
        note: payload.note ?? null,
        summary: {
          workingSets: working.length,
          volumeKg: working.reduce((n, s) => n + s.weightKg * s.reps, 0),
          bodyweightReps: working.filter((s) => s.weightKg === 0).reduce((n, s) => n + s.reps, 0),
          exerciseCount: groups.size,
        },
        exercises: [...groups.values()],
      },
    };
  }
  await page.route(origin + "/api/mobile/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    control.calls.push(req.method() + " " + path);
    if (control.offline) {
      await route.abort("failed");
      return;
    }
    let json: unknown;
    if (path.endsWith("auth/login") || path.endsWith("auth/refresh"))
      json = {
        version: 1,
        accessToken: "synthetic-access",
        refreshToken: "synthetic-refresh",
        expiresAt: 4000000000,
        profile: { id: userId, fullName: "Ana Prueba", email: "ana@example.test", role: "student" },
      };
    else if (path.endsWith("comments/unread")) json = { version: 1, items: [] };
    else if (path.endsWith("/comments") && req.method() === "GET")
      json = {
        version: 1,
        workoutId: path.split("/")[5],
        items: [],
        nextCursor: null,
        unreadCount: 0,
      };
    else if (path.endsWith("/week/download")) {
      control.requests++;
      if (control.waiting) await control.waiting;
      if (control.lost) {
        await route.abort("failed");
        return;
      }
      json = { version: 1, userId, pack: control.pack };
    } else if (path.endsWith("/week"))
      json = {
        version: 1,
        kind: "active",
        program: control.pack.program,
        weekNumber: 1,
        weekStart: control.pack.weekStart,
        weekEnd: control.pack.weekEnd,
        sessions: [
          {
            sessionId: downloadId(3),
            label: "A",
            title: "Piernas",
            status: control.saved.size ? "done" : "pending",
            exerciseCount: 2,
            setCount: 4,
            exerciseNames: ["Sentadilla", "Remo"],
          },
        ],
      };
    else if (path.endsWith("/sessions/" + downloadId(3)))
      json = { version: 1, ...control.pack.sessions[0].context };
    else if (path.endsWith("auth/logout")) json = { version: 1, ok: true };
    else if (path.endsWith("/workouts") && req.method() === "POST") {
      const payload = req.postDataJSON().payload as WorkoutPayload;
      control.saveRequests.push(payload);
      const duplicate = control.saved.has(payload.id);
      if (!duplicate) control.saved.set(payload.id, payload);
      if (control.saveLost) {
        control.saveLost = false;
        await route.abort("failed");
        return;
      }
      json = {
        version: 1,
        ok: true,
        status: duplicate ? "duplicate" : "created",
        workoutId: payload.id,
      };
    } else if (/\/workouts\/[a-f0-9-]+$/.test(path) && control.saved.has(path.split("/").at(-1)!))
      json = result(control.saved.get(path.split("/").at(-1)!)!);
    else {
      await route.fulfill({
        status: 503,
        json: { version: 1, error: { code: "unavailable", message: "Fixture no configurada" } },
      });
      return;
    }
    await route.fulfill({ json, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await page.goto("/");
  await enterWeekUser(page);
  return control;
}
