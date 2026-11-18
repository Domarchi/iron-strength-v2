// Informes de errores sin datos personales (spec 012, T262). Solo se conserva lo técnico:
// tipo de error, pila y versión. Nunca nombre, correo, IP, rutas con IDs ni contenido de entrenamiento.
type Json = Record<string, unknown>;

/** Quita todo lo que pueda identificar a la persona o filtrar datos de entrenamiento. */
export function scrubEvent<T extends Json>(event: T): T {
  const copy: Json = { ...event };
  for (const key of ["user", "request", "extra", "breadcrumbs", "contexts", "tags", "server_name"])
    delete copy[key];
  if (typeof copy.message === "string") copy.message = redact(copy.message);
  const exception = copy.exception as { values?: { value?: unknown }[] } | undefined;
  if (exception?.values)
    copy.exception = {
      ...exception,
      values: exception.values.map((v) => ({
        ...v,
        value: typeof v.value === "string" ? redact(v.value) : v.value,
      })),
    };
  return copy as T;
}
/** Oculta correos, UUID y secuencias largas de dígitos de un texto. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[correo]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]");
}
