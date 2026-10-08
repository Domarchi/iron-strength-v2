import { describe, expect, it } from "vitest";
import { summarizeUnread, unreadLabel, type UnreadRow } from "./unread";

const row = (workoutId: string, studentId: string, count: number): UnreadRow => ({
  workoutId,
  studentId,
  count,
  lastCommentAt: "2026-10-08T12:00:00Z",
});

describe("summarizeUnread (RF-37)", () => {
  it("sin filas no hay nada sin leer", () => {
    const s = summarizeUnread([]);
    expect(s.totalComments).toBe(0);
    expect(s.workouts).toBe(0);
    expect(s.byStudent.size).toBe(0);
    expect(s.byWorkout.size).toBe(0);
  });

  it("agrupa por entrenamiento y por alumno", () => {
    const s = summarizeUnread([row("w1", "ana", 2), row("w2", "ana", 1), row("w3", "bea", 3)]);
    expect(s.totalComments).toBe(6);
    expect(s.workouts).toBe(3);
    expect(s.byStudent.get("ana")).toEqual({ comments: 3, workouts: 2 });
    expect(s.byStudent.get("bea")).toEqual({ comments: 3, workouts: 1 });
    expect(s.byWorkout.get("w1")).toBe(2);
  });
});

describe("unreadLabel", () => {
  it("singular y plural", () => {
    expect(unreadLabel(1)).toBe("1 comentario sin leer");
    expect(unreadLabel(4)).toBe("4 comentarios sin leer");
  });
});
