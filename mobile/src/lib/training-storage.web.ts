import type { TrainingStorage } from "./training";
// Solo registro por cuenta y preferencia de apariencia del dispositivo. Las credenciales web siguen en memoria.
export const trainingStorage: TrainingStorage = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => {
    localStorage.setItem(key, value);
  },
  remove: async (key) => {
    localStorage.removeItem(key);
  },
};
