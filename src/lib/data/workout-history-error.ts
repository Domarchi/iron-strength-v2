export class WorkoutHistoryPageError extends Error {
  constructor(readonly code: "invalid" | "stale" | "unavailable") {
    super(
      code === "invalid"
        ? "La página solicitada no es válida. Vuelve al inicio del historial."
        : code === "stale"
          ? "Esta página anterior ya no es precisa. Vuelve al inicio del historial."
          : "No pudimos cargar el historial. Reintenta.",
    );
    this.name = "WorkoutHistoryPageError";
  }
}
