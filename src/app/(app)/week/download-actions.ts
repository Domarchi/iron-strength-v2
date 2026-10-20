"use server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { downloadCurrentWeek } from "@/lib/data/offline-week";
import type { WeekPackage } from "@/lib/offline/package";
export async function downloadWeekAction(): Promise<
  { ok: true; pack: WeekPackage } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user)
    return { ok: false, error: "Tu sesión expiró. Vuelve a entrar para descargar la semana." };
  try {
    return { ok: true, pack: await downloadCurrentWeek(await createClient(), user.id) };
  } catch {
    return {
      ok: false,
      error:
        "No se pudo completar la descarga. Comprueba la conexión y actualiza Mi semana antes de reintentar.",
    };
  }
}
