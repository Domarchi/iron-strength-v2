import { Platform } from "react-native";
import { scrubEvent } from "./monitoring-scrub";

let started = false;
/**
 * Activa el monitoreo de errores solo en versiones de tienda/preview que traen un DSN
 * (`EXPO_PUBLIC_SENTRY_DSN`), nunca en desarrollo ni en web, y sin datos personales.
 */
export function startMonitoring(): boolean {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (started || !dsn || __DEV__ || Platform.OS === "web") return false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require("@sentry/react-native") as typeof import("@sentry/react-native");
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    attachScreenshot: false,
    beforeSend: (event) =>
      scrubEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
    beforeBreadcrumb: () => null,
  });
  started = true;
  return true;
}
