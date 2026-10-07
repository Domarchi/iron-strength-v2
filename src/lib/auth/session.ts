import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: "coach" | "student";
};

// Usuario autenticado con su perfil, o null. `getUser()` valida el token con Supabase
// (no se confía solo en la cookie). Una vez por petición gracias a cache().
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  // Un usuario desactivado no ve su perfil (RLS): se trata como sin sesión.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: profile.full_name,
    role: profile.role,
  };
});
