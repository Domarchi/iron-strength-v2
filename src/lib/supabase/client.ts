import { createBrowserClient } from "@supabase/ssr";

// Cliente del navegador: usa solo la clave publicable y la sesión del usuario (RLS decide).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
