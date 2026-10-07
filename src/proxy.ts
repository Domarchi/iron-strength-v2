import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accessDecision } from "@/lib/auth/route-access";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

// Next 16: `proxy` reemplaza a `middleware`. Refresca la sesión de Supabase (cookies) y exige
// sesión en las rutas protegidas. No decide permisos finos: eso es de los layouts y la RLS.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims valida la firma del JWT y refresca la sesión si hace falta.
  const { data } = await supabase.auth.getClaims();
  const decision = accessDecision(request.nextUrl.pathname, Boolean(data?.claims));

  if (decision === "redirect-login") {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    // Conserva las cookies refrescadas (o borradas) en la redirección.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  // Todo menos archivos estáticos y de Next.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
