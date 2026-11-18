import { useEffect } from "react";
import { Platform } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

const TAG = "iron-strength-training";
/**
 * Mantiene la pantalla encendida mientras hay un registro abierto. En web no se usa (la API de
 * wake lock rechaza la promesa sin interacción y abre el overlay de errores de desarrollo) y
 * cualquier rechazo nativo se ignora: nunca debe interrumpir el entrenamiento.
 */
export function useTrainingKeepAwake() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    void activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(TAG).catch(() => {});
    };
  }, []);
}
