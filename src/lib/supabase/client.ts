import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Cliente del navegador: usa solo la clave publicable y la sesión del usuario (RLS decide).
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
