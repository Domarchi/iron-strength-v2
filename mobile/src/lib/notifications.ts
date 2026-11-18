import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { restAlertDelay } from "./alerts-prefs";

const CHANNEL = "training";
const REMINDER_ID = "iron-strength-daily-reminder";
const supported = Platform.OS !== "web";
let configured = false;

async function configure() {
  if (!supported || configured) return;
  configured = true;
  // En primer plano no se muestra nada: ya hay vibración y el descanso está a la vista.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Entrenamiento",
      importance: 3, // AndroidImportance.DEFAULT
    });
}
export const notificationsSupported = supported;
export async function hasNotificationPermission() {
  if (!supported) return false;
  await configure();
  return (await Notifications.getPermissionsAsync()).granted;
}
/** Pide el permiso solo cuando la persona activa un aviso. */
export async function requestNotificationPermission() {
  if (!supported) return false;
  await configure();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}
/** Programa el aviso de fin de descanso; devuelve su ID o null si no corresponde. */
export async function scheduleRestEnd(remainingSeconds: number): Promise<string | null> {
  const seconds = restAlertDelay(remainingSeconds);
  if (!supported || seconds === null || !(await hasNotificationPermission())) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title: "Descanso terminado", body: "Es hora de tu siguiente serie." },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: CHANNEL,
    },
  });
}
export async function cancelNotification(id: string | null) {
  if (supported && id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
export async function scheduleDailyReminder(hour: number, minute: number) {
  if (!supported) return;
  await configure();
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title: "Hora de entrenar", body: "Tu rutina de hoy te espera." },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL,
    },
  });
}
export async function cancelDailyReminder() {
  if (supported) await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
}
