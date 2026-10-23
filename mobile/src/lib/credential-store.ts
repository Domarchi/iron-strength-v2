import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { CredentialStore } from "./client";
const preview = new Map<string, string>();
export function credentialStore(origin: string): CredentialStore {
  const key = "iron-strength.refresh.v1." + origin.replace(/[^a-z0-9_.-]/gi, "_");
  if (Platform.OS === "web")
    return {
      get: async () => preview.get(key) ?? null,
      set: async (value) => {
        preview.set(key, value);
      },
      remove: async () => {
        preview.delete(key);
      },
    };
  return {
    get: () => SecureStore.getItemAsync(key),
    set: (value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    remove: () => SecureStore.deleteItemAsync(key),
  };
}
