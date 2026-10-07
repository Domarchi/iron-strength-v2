// Un alumno puede editar o borrar un entrenamiento hasta 7 días después de su fecha (RF-26b).
// Es la misma regla que aplica la RLS (public.edit_window_start); aquí se usa para decidir
// qué botones mostrar y para dar un error claro antes de llegar a la base.
import { addDays, type DateString } from "./dates";

export const EDIT_WINDOW_DAYS = 7;

export function isWorkoutEditable(performedOn: DateString, today: DateString): boolean {
  return performedOn >= addDays(today, -EDIT_WINDOW_DAYS);
}
