// Exportar el historial a CSV (RF-47, RF-67; DC-31). Formato pensado para Excel en español de Chile:
// UTF-8 con BOM, separador ";" y coma decimal. Los nombres de ejercicio los escribe el coach, así que
// todo texto libre se neutraliza contra inyección de fórmulas antes de entrar a una celda.
import type { DateString } from "./dates.ts";

export const BOM = "﻿";
const SEPARATOR = ";";
const EOL = "\r\n";
const HEADER = ["Fecha", "Sesión", "Ejercicio", "Serie", "Tipo", "Kg", "Reps"];

export type ExportSet = {
  date: DateString;
  sessionLabel: string | null;
  exerciseName: string;
  setNumber: number;
  isWarmup: boolean;
  weightKg: number;
  reps: number;
};

// Excel y Sheets ejecutan como fórmula lo que empieza con = + - @ (o con tabulación / retorno).
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function escapeField(value: string): string {
  const safe = neutralizeFormula(value);
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const decimal = (n: number) => String(n).replace(".", ",");

export function buildHistoryCsv(rows: ExportSet[]): string {
  const lines = rows.map((r) =>
    [
      r.date,
      r.sessionLabel ?? "",
      r.exerciseName,
      String(r.setNumber),
      r.isWarmup ? "Calentamiento" : "Trabajo",
      decimal(r.weightKg),
      String(r.reps),
    ]
      .map(escapeField)
      .join(SEPARATOR),
  );
  return BOM + [HEADER.join(SEPARATOR), ...lines].map((l) => l + EOL).join("");
}

export function csvFileName(studentName: string, today: DateString): string {
  const slug = studentName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `entrenamientos-${slug || "alumno"}-${today}.csv`;
}
