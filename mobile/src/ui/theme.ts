import { usePalette } from "../lib/appearance-context";
import { themes, type Theme } from "./tokens";

/** Tema Forja según la preferencia vigente (Claro / Oscuro / Sistema). */
export function useTheme(): Theme {
  return usePalette().dark ? themes.dark : themes.light;
}
