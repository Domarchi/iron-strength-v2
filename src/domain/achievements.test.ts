import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_KINDS,
  achievementInfo,
  isAchievementKind,
  newlyEarned,
  progressToward,
  type AchievementStats,
} from "./achievements";

const stats = (over: Partial<AchievementStats> = {}): AchievementStats => ({
  workoutCount: 0,
  longestStreak: 0,
  recordCount: 0,
  ...over,
});

describe("catálogo (DC-17)", () => {
  it("tiene los seis logros iniciales en orden de dificultad", () => {
    expect(ACHIEVEMENT_KINDS).toEqual([
      "first_workout",
      "first_record",
      "workouts_10",
      "streak_4",
      "workouts_25",
      "workouts_50",
    ]);
  });

  it("cada logro tiene título y condición en español", () => {
    for (const kind of ACHIEVEMENT_KINDS) {
      const info = achievementInfo(kind);
      expect(info.title.length).toBeGreaterThan(3);
      expect(info.condition.length).toBeGreaterThan(10);
    }
  });

  it("reconoce solo tipos del catálogo", () => {
    expect(isAchievementKind("first_workout")).toBe(true);
    expect(isAchievementKind("inventado")).toBe(false);
    expect(isAchievementKind(42)).toBe(false);
  });
});

describe("newlyEarned (RF-31)", () => {
  it("sin nada hecho no hay logros", () => {
    expect(newlyEarned(stats(), [])).toEqual([]);
  });

  it("el primer entrenamiento otorga 'first_workout'", () => {
    expect(newlyEarned(stats({ workoutCount: 1 }), [])).toEqual(["first_workout"]);
  });

  it("los hitos por cantidad se otorgan al llegar al umbral", () => {
    expect(newlyEarned(stats({ workoutCount: 9 }), ["first_workout"])).toEqual([]);
    expect(newlyEarned(stats({ workoutCount: 10 }), ["first_workout"])).toEqual(["workouts_10"]);
    expect(newlyEarned(stats({ workoutCount: 50 }), ["first_workout", "workouts_10"])).toEqual([
      "workouts_25",
      "workouts_50",
    ]);
  });

  it("4 semanas seguidas usa la racha más larga, aunque la actual se haya roto", () => {
    expect(newlyEarned(stats({ workoutCount: 1, longestStreak: 3 }), ["first_workout"])).toEqual(
      [],
    );
    expect(newlyEarned(stats({ workoutCount: 1, longestStreak: 4 }), ["first_workout"])).toEqual([
      "streak_4",
    ]);
  });

  it("el primer récord exige al menos un récord", () => {
    expect(newlyEarned(stats({ workoutCount: 2, recordCount: 1 }), ["first_workout"])).toEqual([
      "first_record",
    ]);
  });

  it("no repite lo que ya se tiene (permanentes) y respeta el orden del catálogo", () => {
    const all = stats({ workoutCount: 60, longestStreak: 9, recordCount: 5 });
    expect(newlyEarned(all, ["first_workout", "workouts_10"])).toEqual([
      "first_record",
      "streak_4",
      "workouts_25",
      "workouts_50",
    ]);
    expect(newlyEarned(all, ACHIEVEMENT_KINDS)).toEqual([]);
  });

  it("ignora tipos desconocidos en lo ya obtenido", () => {
    expect(newlyEarned(stats({ workoutCount: 1 }), ["inventado" as never])).toEqual([
      "first_workout",
    ]);
  });
});

describe("progressToward (RF-66)", () => {
  it("muestra cuánto falta para los hitos por cantidad y por racha", () => {
    expect(progressToward("workouts_10", stats({ workoutCount: 7 }))).toEqual({
      current: 7,
      target: 10,
    });
    expect(progressToward("workouts_25", stats({ workoutCount: 40 }))).toEqual({
      current: 25,
      target: 25,
    });
    expect(progressToward("streak_4", stats({ longestStreak: 2 }))).toEqual({
      current: 2,
      target: 4,
    });
  });

  it("no hay barra para los logros de una sola vez", () => {
    expect(progressToward("first_workout", stats())).toBeNull();
    expect(progressToward("first_record", stats())).toBeNull();
  });
});
