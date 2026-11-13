import { View } from "react-native";
import { useAlerts } from "../lib/alerts-context";
import { formatTime } from "../lib/alerts-prefs";
import { Banner } from "../ui/feedback";
import { Stepper, Toggle } from "../ui/controls";
import { Txt } from "../ui/text";

/** Ajustes de avisos (descanso y recordatorio). Solo existen en la app del teléfono. */
export function AlertsSettings() {
  const a = useAlerts();
  if (!a.supported || !a.ready) return null;
  const { reminder } = a.prefs;
  return (
    <View style={{ gap: 10 }}>
      <Txt variant="label" muted accessibilityRole="header">
        Avisos
      </Txt>
      <Toggle
        label="Avisar al terminar el descanso"
        description="Recibes un aviso si cambias de app o apagas la pantalla."
        value={a.prefs.restEnd}
        onChange={(v) => void a.setRestEnd(v)}
      />
      <Toggle
        label="Recordatorio diario para entrenar"
        description={
          reminder.enabled
            ? `Todos los días a las ${formatTime(reminder.hour, reminder.minute)}`
            : "Apagado"
        }
        value={reminder.enabled}
        onChange={(v) => void a.setReminder({ enabled: v })}
      />
      {reminder.enabled ? (
        <Stepper
          label="Hora del recordatorio"
          unit="h"
          value={reminder.hour}
          min={0}
          max={23}
          step={1}
          format={(n) => String(n).padStart(2, "0")}
          onChange={(hour) => void a.setReminder({ hour })}
        />
      ) : null}
      {a.error ? <Banner tone="danger" message={a.error} /> : null}
    </View>
  );
}
