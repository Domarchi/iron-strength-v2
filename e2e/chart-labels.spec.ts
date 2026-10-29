import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { admin, resetAll, seedCoach, COACH } from "./support/db";
import { login } from "./support/ui";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { typedRecordingPayloadSchema } from "../src/lib/mobile/typed-recording-contracts";
import { progressHref } from "../src/lib/navigation/training-context";
import type { TrainingMetrics } from "../src/domain/training-metrics";

const cases = [
  {
    name: "Volumen",
    type: "weight_reps",
    metric: "externalVolumeKg",
    values: {
      recordType: "weight_reps",
      weightKg: 500,
      reps: 100,
      durationSeconds: null,
      distanceMeters: null,
    },
  },
  {
    name: "Tiempo",
    type: "duration",
    metric: "totalDurationSeconds",
    values: {
      recordType: "duration",
      weightKg: null,
      reps: null,
      durationSeconds: 86400,
      distanceMeters: null,
    },
  },
  {
    name: "Distancia",
    type: "distance_duration",
    metric: "totalDistanceMeters",
    values: {
      recordType: "distance_duration",
      weightKg: null,
      reps: null,
      durationSeconds: 60,
      distanceMeters: 1000000,
    },
  },
] as const;

for (const theme of ["light", "dark"] as const)
  test(`etiquetas completas en gráficos ${theme} desde 360px`, async ({ page }, testInfo) => {
    await resetAll();
    const coachId = await seedCoach(),
      db = admin(),
      ids: string[] = [];
    const own = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(
      (await own.auth.signInWithPassword({ email: COACH.email, password: COACH.password })).error,
    ).toBeNull();
    for (const c of cases) {
      const exerciseId = randomUUID();
      expect(
        (
          await db.from("exercises").insert({
            id: exerciseId,
            coach_id: coachId,
            name: `Gráfico ${c.name}`,
            muscle_group: "Core",
            record_type: c.type,
          })
        ).error,
      ).toBeNull();
      const p = typedRecordingFixture();
      if (p.source !== "free") throw Error("fixture");
      p.id = randomUUID();
      p.workout.id = p.id;
      p.workout.startedAt = new Date().toISOString();
      p.workout.finishedAt = p.workout.startedAt;
      p.workout.durationSeconds = 0;
      p.structure.exercises = [
        {
          id: randomUUID(),
          exerciseId,
          prescribedExerciseId: null,
          prescribed: {
            recordType: c.type,
            sets: 1,
            target: {
              repsMin: c.values.reps,
              repsMax: c.values.reps,
              targetWeightKg: c.values.weightKg,
              targetDurationSeconds: c.values.durationSeconds,
              targetDistanceMeters: c.values.distanceMeters,
            },
            series: null,
          },
          note: null,
          restSeconds: 0,
          supersetId: null,
          supersetRestSeconds: null,
        },
      ];
      p.workout.exerciseNotes = [{ sessionExerciseId: p.structure.exercises[0].id, note: null }];
      p.workout.sets = Array.from({ length: 20 }, (_, i) => ({
        exerciseId,
        position: 0,
        setNumber: i + 1,
        metrics: c.values as TrainingMetrics,
        setType: "working",
        effort: null,
      }));
      expect(
        (
          await own.rpc("save_typed_workout_recording", {
            p_recording: typedRecordingPayloadSchema.parse(p),
          })
        ).error,
      ).toBeNull();
      ids.push(exerciseId);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await login(page, COACH.email, COACH.password);
    for (const [i, c] of cases.entries()) {
      await page.goto(
        progressHref(ids[i], { weeks: 8, view: "1rm", recordType: c.type, metric: c.metric }),
      );
      const chart = page.getByRole("img", { name: new RegExp(`^Gráfico ${c.name} · `) });
      await expect(chart).toBeVisible();
      await expect(chart.locator("text")).not.toHaveCount(0);
      await chart.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
      await page.evaluate(() => document.fonts.ready);
      const overflow = await chart.evaluate((node) => {
        const svg = node as SVGSVGElement,
          width = svg.viewBox.baseVal.width;
        return [...svg.querySelectorAll("text")].flatMap((label) => {
          const box = label.getBBox();
          return box.x < -0.5 || box.x + box.width > width + 0.5
            ? [{ text: label.textContent, x: box.x, width: box.width }]
            : [];
        });
      });
      await chart.screenshot({ path: testInfo.outputPath(`chart-${c.type}-${theme}-360.png`) });
      expect(overflow).toEqual([]);
    }
  });

test.afterAll(async () => {
  await resetAll();
});
