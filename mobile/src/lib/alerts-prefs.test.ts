import { describe, expect, it } from "vitest";
import {
  ALERTS_KEY,
  defaultAlerts,
  formatTime,
  parseAlerts,
  readAlerts,
  restAlertDelay,
  saveAlerts,
} from "./alerts-prefs";

const mem = (initial: string | null = null) => {
  let v = initial;
  return {
    get: async () => v,
    set: async (_k: string, value: string) => {
      v = value;
    },
    peek: () => v,
  };
};

describe("preferencias de avisos", () => {
  it("parte apagada y lee lo guardado", async () => {
    expect(await readAlerts(mem())).toEqual(defaultAlerts);
    const s = mem();
    const next = { restEnd: true, reminder: { enabled: true, hour: 7, minute: 30 } };
    await saveAlerts(s, next);
    expect(await readAlerts(s)).toEqual(next);
    expect(JSON.parse(s.peek()!).version).toBe(1);
  });
  it("rechaza formatos desconocidos o fuera de rango sin reemplazarlos", async () => {
    for (const raw of [
      "{}",
      '{"version":2,"restEnd":true}',
      '{"version":1,"restEnd":"si","reminder":{"enabled":true,"hour":7,"minute":0}}',
      '{"version":1,"restEnd":true,"reminder":{"enabled":true,"hour":24,"minute":0}}',
      '{"version":1,"restEnd":true,"reminder":{"enabled":true,"hour":7,"minute":60}}',
    ])
      expect(() => parseAlerts(raw)).toThrow("desconocido");
    const s = mem('{"version":9}');
    await expect(readAlerts(s)).rejects.toThrow();
    expect(s.peek()).toBe('{"version":9}');
  });
  it("no confirma un guardado que no se releyó igual", async () => {
    const lossy = { get: async () => null, set: async () => {} };
    await expect(saveAlerts(lossy, defaultAlerts)).rejects.toThrow("No se confirmó");
  });
  it("calcula el retraso del aviso de descanso solo en un rango razonable", () => {
    expect(restAlertDelay(60)).toBe(60);
    expect(restAlertDelay(1)).toBeNull();
    expect(restAlertDelay(7200)).toBeNull();
    expect(restAlertDelay(Number.NaN)).toBeNull();
    expect(formatTime(7, 5)).toBe("07:05");
    expect(ALERTS_KEY).toBe("is:native-alerts:v1");
  });
});
