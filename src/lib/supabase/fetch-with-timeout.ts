// Límite de espera para toda consulta a datos desde el servidor (DC-20): pasados 10 segundos la
// petición se aborta y la pantalla muestra su error con botón de reintentar, en lugar de quedarse
// cargando para siempre.
export const DATA_TIMEOUT_MS = 10_000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function fetchWithTimeout(base: FetchLike = fetch, timeoutMs = DATA_TIMEOUT_MS): FetchLike {
  return async (input, init) => {
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(new Error("La consulta tardó demasiado en responder.")),
      timeoutMs,
    );

    // Se combinan la señal del llamador y la del límite: lo que ocurra primero aborta.
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal;
    try {
      return await base(input, { ...init, signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
