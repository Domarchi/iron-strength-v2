import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/** Respuesta háptica segura: nunca rompe el flujo si el dispositivo no la soporta (web, simulador). */
export function tap(kind: "light" | "success" | "warning" = "light") {
  if (Platform.OS === "web") return;
  const run =
    kind === "light"
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          kind === "success"
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
  void run.catch(() => {});
}
