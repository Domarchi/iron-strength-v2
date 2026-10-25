/** Instancia destructiva de pruebas; nunca la base interactiva ni un proyecto remoto. */
export function isIsolatedTestBackend(
  url: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  if (url === "http://127.0.0.1:55321") return true;
  return (
    url === "http://127.0.0.1:54321" &&
    environment.CI === "true" &&
    environment.GITHUB_ACTIONS === "true" &&
    environment.RUNNER_ENVIRONMENT === "github-hosted"
  );
}
