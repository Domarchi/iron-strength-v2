import { Lock, Trophy } from "lucide-react";
import {
  ACHIEVEMENT_KINDS,
  achievementInfo,
  progressToward,
  type AchievementStats,
} from "@/domain/achievements";
import type { EarnedAchievement } from "@/lib/data/achievements";
import { cn } from "@/lib/utils";

const date = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Santiago",
});

// Logros obtenidos con su fecha y los que faltan con su condición y avance (RF-66).
export function AchievementsList({
  earned,
  stats,
}: {
  earned: EarnedAchievement[];
  stats: AchievementStats;
}) {
  const byKind = new Map(earned.map((a) => [a.kind, a]));

  return (
    <section aria-labelledby="achievements-heading" className="flex flex-col gap-3">
      <h2 id="achievements-heading" className="text-lg font-medium">
        Logros{" "}
        <span className="text-sm font-normal text-muted-foreground">
          {earned.length} de {ACHIEVEMENT_KINDS.length}
        </span>
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ACHIEVEMENT_KINDS.map((kind) => {
          const info = achievementInfo(kind);
          const got = byKind.get(kind);
          const progress = got ? null : progressToward(kind, stats);
          return (
            <li
              key={kind}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3",
                got ? "border-primary/50 bg-primary/5" : "bg-card",
              )}
            >
              {got ? (
                <Trophy className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
              ) : (
                <Lock className="mt-0.5 size-6 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {info.title}
                  <span className="sr-only">{got ? " (obtenido)" : " (pendiente)"}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {got ? `Obtenido el ${date.format(new Date(got.earnedAt))}` : info.condition}
                </p>
                {progress ? (
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {progress.current} de {progress.target}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
