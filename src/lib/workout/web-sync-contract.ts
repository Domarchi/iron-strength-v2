export const webSyncErrors = {
  unauthorized: [401, "Vuelve a iniciar sesión. Tu registro se conserva."],
  account_changed: [403, "La cuenta cambió. Retoma el registro con su cuenta original."],
  forbidden: [403, "No tienes permiso para enviar este entrenamiento."],
  invalid_input: [400, "Revisa el entrenamiento antes de volver a enviar."],
  conflict: [409, "El contenido o la prescripción cambió. Conservamos tu intento para revisarlo."],
  not_found: [404, "La rutina de origen ya no está disponible. Conservamos tu registro."],
  removed: [422, "Este entrenamiento fue eliminado. Conservamos el registro local para revisarlo."],
  unavailable: [503, "No pudimos confirmar el envío. Conservamos tu registro."],
  wrong_week: [
    422,
    "La rutina no corresponde a la semana en que empezaste. Conservamos tu registro.",
  ],
  alternative_unavailable: [422, "La alternativa ya no está autorizada. Conservamos tu registro."],
  no_sets: [400, "Completa al menos una serie."],
  id_taken: [409, "El identificador ya tiene otro contenido. Conservamos tu registro."],
} as const;
export type WebSyncCode = keyof typeof webSyncErrors;
