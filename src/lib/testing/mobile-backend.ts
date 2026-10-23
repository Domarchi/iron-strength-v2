/** La app interactiva en 54321 nunca es un destino de pruebas locales móviles. */
export function isMobileTestBackend(
  url: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  if (url === "http://127.0.0.1:55321") return true;
  // CI crea una pila nueva dentro de una VM efímera: no usar esta excepción en runners propios.
  return (
    url === "http://127.0.0.1:54321" &&
    environment.CI === "true" &&
    environment.GITHUB_ACTIONS === "true" &&
    environment.RUNNER_ENVIRONMENT === "github-hosted"
  );
}
