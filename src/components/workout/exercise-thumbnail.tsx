import Image from "next/image";
import { cn } from "@/lib/utils";
import { Dumbbell } from "lucide-react";

// Ilustraciones propias de patrones de movimiento; son ayudas de identificación, no una guía
// de técnica. Los ejercicios sin un patrón conocido conservan una miniatura genérica.
export function ExerciseThumbnail({
  name,
  featured = false,
}: {
  name: string;
  featured?: boolean;
}) {
  const key = name.toLocaleLowerCase("es-CL");
  const pose = /sentadilla|zancada/.test(key)
    ? "squat"
    : /peso muerto|deadlift|rdl/.test(key)
      ? "hinge"
      : /dominada|jal[oó]n/.test(key)
        ? "pull"
        : /remo/.test(key)
          ? "row"
          : /press militar|press de hombro|press arnold/.test(key)
            ? "overhead"
            : /press.*banca|press.*pecho|press.*inclinado|press.*mancuerna/.test(key)
              ? "bench"
              : null;
  return (
    <span
      className={cn(
        "exercise-thumbnail grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/60",
        featured && "exercise-illustration",
      )}
      aria-hidden="true"
    >
      {key === "sentadilla" || key === "sentadilla con barra" ? (
        <Image
          src={
            featured
              ? "/design/azul-atleta/squat-320-v1.webp"
              : "/design/azul-atleta/squat-160-v1.webp"
          }
          alt=""
          width={featured ? 160 : 48}
          height={featured ? 160 : 48}
          unoptimized
          className="size-full object-contain"
        />
      ) : pose ? (
        <svg
          viewBox="0 0 64 64"
          className="size-full p-1"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 56h48" className="text-muted-foreground/40" strokeWidth="1.5" />
          {pose === "squat" ? (
            <>
              <circle cx="35" cy="13" r="4" />
              <path d="m33 21-7 13 13 6-8 12m-5-18-9 9 6 9m9-29 8 6" />
              <path d="M14 23h36m-33-5v10m30-10v10" className="text-primary" strokeWidth="3.5" />
            </>
          ) : null}
          {pose === "hinge" ? (
            <>
              <circle cx="42" cy="19" r="4" />
              <path d="m37 24-14 9 3 10-7 9m4-19 13 11-3 8m0-25 4 16" />
              <path d="M25 46h24m-21-5v10m18-10v10" className="text-primary" strokeWidth="3.5" />
            </>
          ) : null}
          {pose === "pull" ? (
            <>
              <circle cx="32" cy="23" r="4" />
              <path d="M32 31v13l-7 9m7-9 7 9M28 31 18 21V11m18 20 10-10V11" />
              <path d="M10 9h44M14 9v8m36-8v8" className="text-primary" strokeWidth="3.5" />
            </>
          ) : null}
          {pose === "row" ? (
            <>
              <circle cx="41" cy="17" r="4" />
              <path d="m36 23-13 10-4 19m4-19 13 12-3 7m0-27 8 11-5 4" />
              <path d="M30 41h20m-17-5v10m14-10v10" className="text-primary" strokeWidth="3.5" />
            </>
          ) : null}
          {pose === "overhead" ? (
            <>
              <circle cx="32" cy="24" r="4" />
              <path d="M32 32v11l-8 10m8-10 8 10M27 32 20 23V12m17 20 7-9V12" />
              <path d="M11 10h42m-37-4v9m32-9v9" className="text-primary" strokeWidth="3.5" />
            </>
          ) : null}
          {pose === "bench" ? (
            <>
              <circle cx="15" cy="35" r="4" />
              <path d="M23 39h18l7 10h8M29 38V23m7 15V23M18 46h26m-23 0v8m20-8v8" />
              <path d="M17 20h29m-25-5v10m21-10v10" className="text-primary" strokeWidth="3.5" />
            </>
          ) : null}
        </svg>
      ) : (
        <Dumbbell className="size-8 text-primary" />
      )}
    </span>
  );
}
