import { assignedFromLegacy, assignedFixtureResult } from "./assigned-context";
import {
  typedRecordingRequestSchema,
  type TypedRecordingPayload,
} from "../../../src/lib/mobile/typed-recording-contracts";
import type { QueuedWorkoutPayload } from "../../src/lib/queued-recording";
import { progressFromResults, fixtureTrainingSetId } from "./training-progress-results";
import {
  recordingRequestSchema,
  type RecordingPayload,
} from "../../../src/lib/mobile/recording-contracts";
import { expect, type Page } from "@playwright/test";
import { santiagoDate } from "../../../src/domain/dates";
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
    saveRequests: [] as QueuedWorkoutPayload[],
    recordings: new Map<string, RecordingPayload | TypedRecordingPayload>(),
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
        id: fixtureTrainingSetId(payload.id, i),
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: set.isWarmup,
      });
      groups.set(set.position, row);
    });
    const working = payload.sets.filter((s) => !s.isWarmup);
    const recording = control.recordings.get(payload.id);
    return {
      version: 1,
      workout: {
        id: payload.id,
        ...(recording?.version === 2 ? { structure: recording.structure } : {}),
        programName: control.pack.program.name,
        sessionLabel: payload.sessionLabel,
        startedAt: payload.startedAt,
        performedOn: santiagoDate(new Date(payload.startedAt)),
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
    else if (path.endsWith("/training-progress"))
      json = progressFromResults(
        userId,
        [...control.saved.values()].map(result),
        santiagoDate(new Date()),
      );
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
        sessions: control.pack.sessions.map(({ context }) => ({
          sessionId: context.session.id,
          label: context.session.label,
          title: context.session.title,
          status: [...control.saved.values()].some((p) => p.programSessionId === context.session.id)
            ? "done"
            : "pending",
          exerciseCount: context.exercises.length,
          setCount: context.exercises.reduce((n, e) => n + e.prescribed.sets, 0),
          exerciseNames: context.exercises.map((e) => e.name),
        })),
      };
    else if (path.includes("/training-sessions/")) {
      const found = control.pack.sessions.find((s) =>
        path.endsWith("/training-sessions/" + s.context.session.id),
      );
      if (found)
        json = assignedFromLegacy(
          { version: 1, ...found.context },
          userId,
          control.pack.program,
          found.revision,
          control.pack.history,
        );
    } else if (path.includes("/sessions/")) {
      const found = control.pack.sessions.find((s) =>
        path.endsWith("/sessions/" + s.context.session.id),
      );
      if (found) json = { version: 1, ...found.context };
    } else if (path.endsWith("/typed-recordings") && req.method() === "POST") {
      const p = typedRecordingRequestSchema.parse(req.postDataJSON()).payload;
      if (p.source !== "assigned") return route.fallback();
      control.saveRequests.push(p);
      control.recordings.set(p.id, p);
      const duplicate = control.saved.has(p.id);
      // This legacy package fixture has only null-kind exercises. Modern dimensions use their own fixture.
      const sets = p.workout.sets.map((s) => {
        if (s.metrics.recordType !== null || s.metrics.weightKg === null || s.metrics.reps === null)
          throw Error("legacy fixture only");
        return {
          exerciseId: s.exerciseId,
          sessionExerciseId: s.sessionExerciseId,
          prescribedExerciseId: s.prescribedExerciseId,
          exerciseName: s.exerciseName,
          position: s.position,
          setNumber: s.setNumber,
          weightKg: s.metrics.weightKg,
          reps: s.metrics.reps,
          isWarmup: s.setType === "warmup",
        };
      });
      if (!duplicate)
        control.saved.set(p.id, {
          id: p.id,
          programId: p.workout.programId,
          programSessionId: p.workout.programSessionId,
          sessionLabel: p.workout.sessionLabel,
          startedAt: p.workout.startedAt,
          finishedAt: p.workout.finishedAt,
          durationSeconds: p.workout.durationSeconds,
          perceivedEffort: p.workout.perceivedEffort,
          note: p.workout.note,
          sets,
        });
      if (control.saveLost) {
        control.saveLost = false;
        await route.abort("failed");
        return;
      }
      json = { version: 3, ok: true, status: duplicate ? "duplicate" : "created", workoutId: p.id };
    } else if (/\/typed-recordings\/[a-f0-9-]+$/.test(path)) {
      const p = control.recordings.get(path.split("/").at(-1)!);
      if (p?.version === 3) {
        const found = control.pack.sessions.find(
          (s) => p.source === "assigned" && s.context.session.id === p.workout.programSessionId,
        );
        if (!found) throw Error("fixture source");
        json = assignedFixtureResult(
          assignedFromLegacy(
            { version: 1, ...found.context },
            userId,
            control.pack.program,
            found.revision,
          ),
          p,
        );
      } else {
        await route.fulfill({
          status: 404,
          json: { version: 1, error: { code: "not_found", message: "Resultado anterior" } },
        });
        return;
      }
    } else if (path.endsWith("auth/logout")) json = { version: 1, ok: true };
    else if (
      (path.endsWith("/workouts") || path.endsWith("/recordings")) &&
      req.method() === "POST"
    ) {
      const recording = path.endsWith("/recordings")
        ? recordingRequestSchema.parse(req.postDataJSON()).payload
        : null;
      if (recording && recording.source !== "assigned") return route.fallback();
      const payload = recording
        ? (recording.workout as WorkoutPayload)
        : (req.postDataJSON().payload as WorkoutPayload);
      control.saveRequests.push(recording ?? payload);
      if (recording) control.recordings.set(recording.id, recording);
      const duplicate = control.saved.has(payload.id);
      if (!duplicate) control.saved.set(payload.id, payload);
      if (control.saveLost) {
        control.saveLost = false;
        await route.abort("failed");
        return;
      }
      json = {
        version: recording ? 2 : 1,
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
/** Emits the same signal Expo Network observes on web; transport failures stay controlled separately. */
export async function setWeekConnectivity(page: Page, online: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  }, online);
}
