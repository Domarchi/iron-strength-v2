"use client";
import { useState, useSyncExternalStore } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { normalizeThemePreference, persistThemePreference } from "@/lib/design/theme";
function subscribe(notify: () => void) {
  window.addEventListener("iron-theme-applied", notify);
  return () => window.removeEventListener("iron-theme-applied", notify);
}
export function ThemeSelect() {
  const theme = useSyncExternalStore(
    subscribe,
    () => normalizeThemePreference(document.documentElement.dataset.themePreference),
    () => "system" as const,
  );
  const [temporary, setTemporary] = useState(false);
  return (
    <section
      aria-labelledby="theme-heading"
      className="flow-panel space-y-3 rounded-xl border bg-card p-5"
    >
      <div>
        <h2 id="theme-heading" className="text-lg font-semibold">
          Apariencia
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige cómo se ve la app en este dispositivo.
        </p>
      </div>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Tema visual
        <NativeSelect
          aria-label="Tema visual"
          value={theme}
          onChange={(event) => {
            const choice = normalizeThemePreference(event.target.value);
            let saved = false;
            try {
              saved = persistThemePreference(localStorage, choice);
            } catch {
              /* Acceder a Storage también puede estar bloqueado. */
            }
            setTemporary(!saved);
            window.dispatchEvent(new CustomEvent("iron-theme-preference", { detail: choice }));
          }}
        >
          <option value="system">Sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </NativeSelect>
      </label>
      {temporary ? (
        <StatusMessage error>
          No se pudo guardar el tema. Se aplica en esta pestaña; al recargar se volverá a comprobar
          la preferencia.
        </StatusMessage>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sistema sigue la apariencia de tu teléfono o computador.
        </p>
      )}
    </section>
  );
}
