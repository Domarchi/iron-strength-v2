// Comentarios no leídos (RF-37; DC-30): agrupa las filas que entrega la base por entrenamiento y por
// alumno para pintar marcas y contadores.

export type UnreadRow = {
  workoutId: string;
  studentId: string;
  count: number;
  lastCommentAt: string;
};

export type UnreadSummary = {
  totalComments: number;
  workouts: number; // entrenamientos con algo sin leer
  byStudent: Map<string, { comments: number; workouts: number }>;
  byWorkout: Map<string, number>;
};

export function summarizeUnread(rows: UnreadRow[]): UnreadSummary {
  const byStudent = new Map<string, { comments: number; workouts: number }>();
  const byWorkout = new Map<string, number>();
  let totalComments = 0;

  for (const row of rows) {
    totalComments += row.count;
    byWorkout.set(row.workoutId, (byWorkout.get(row.workoutId) ?? 0) + row.count);
    const current = byStudent.get(row.studentId) ?? { comments: 0, workouts: 0 };
    byStudent.set(row.studentId, {
      comments: current.comments + row.count,
      workouts: current.workouts + 1,
    });
  }

  return { totalComments, workouts: byWorkout.size, byStudent, byWorkout };
}

export const unreadLabel = (count: number): string =>
  `${count} ${count === 1 ? "comentario" : "comentarios"} sin leer`;
