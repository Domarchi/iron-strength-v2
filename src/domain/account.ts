// Confirmación para borrar la cuenta (RF-48; DC-33): el alumno escribe la palabra BORRAR.
export const DELETE_CONFIRMATION = "BORRAR";

export function isDeleteConfirmation(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trim().toUpperCase() === DELETE_CONFIRMATION;
}
