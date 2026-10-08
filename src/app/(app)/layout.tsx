import Link from "next/link";
import { CircleUser, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppChrome } from "@/components/layout/app-chrome";
import { AppNav } from "@/components/layout/app-nav";
import { navItemsFor, withUnreadBadge } from "@/components/layout/nav-items";
import { requireUser } from "@/lib/auth/session";
import { getUnreadSummary } from "@/lib/data/unread";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "../(auth)/actions";

// Todo lo que cuelga de (app) exige un perfil activo. La RLS sigue siendo la barrera real.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // El contador de no leídos nunca debe tumbar la pantalla: si falla, simplemente no se muestra.
  const unread = await getUnreadSummary(await createClient()).catch(() => null);
  const items = withUnreadBadge(navItemsFor(user.role), user.role, unread?.totalComments ?? 0);

  return (
    <AppChrome
      header={
        <header className="border-b pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
            <span className="font-bold tracking-tight">IRON STRENGTH</span>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.fullName}
              </span>
              <Button variant="ghost" aria-label="Mi cuenta" render={<Link href="/account" />}>
                <CircleUser aria-hidden />
              </Button>
              <form action={logoutAction}>
                <Button type="submit" variant="ghost" aria-label="Cerrar sesión">
                  <LogOut aria-hidden />
                  <span className="hidden sm:inline">Salir</span>
                </Button>
              </form>
            </div>
          </div>
          <div className="mx-auto hidden max-w-5xl px-4 md:block">
            <AppNav items={items} />
          </div>
        </header>
      }
      nav={<AppNav items={items} />}
    >
      {children}
    </AppChrome>
  );
}
