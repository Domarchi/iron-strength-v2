"use client";

import { useEffect } from "react";
import { Trophy } from "lucide-react";
import { achievementInfo, type AchievementKind } from "@/domain/achievements";

// Anuncio de logros recién obtenidos (RF-65). Se muestra una sola vez: al montarse quita `logros` de la
// dirección, así que recargar la página ya no lo repite.
export function NewAchievements({ kinds }: { kinds: AchievementKind[] }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("logros")) return;
    url.searchParams.delete("logros");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  if (kinds.length === 0) return null;
  return (
    <section
      aria-label="Logros nuevos"
      className="flex flex-col gap-2 rounded-xl border border-primary/50 bg-primary/10 p-4"
    >
      <p className="text-xs font-semibold tracking-wide text-primary uppercase">
        {kinds.length === 1 ? "¡Logro desbloqueado!" : "¡Logros desbloqueados!"}
      </p>
      <ul className="flex flex-col gap-2">
        {kinds.map((kind) => (
          <li key={kind} className="flex items-center gap-3">
            <Trophy className="size-6 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-semibold">{achievementInfo(kind).title}</p>
              <p className="text-sm text-muted-foreground">{achievementInfo(kind).condition}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
