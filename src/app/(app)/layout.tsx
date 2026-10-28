import { WorkoutChangesProvider } from "@/components/workout-changes/provider";
import Link from "next/link";
import { SyncWorkouts } from "@/components/offline/sync-workouts";
import { AccountBoundary, OfflineAccount } from "@/components/offline/account";
import { CircleUser, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppChrome } from "@/components/layout/app-chrome";
import { AppNav } from "@/components/layout/app-nav";
import { Brand } from "@/components/layout/brand";
import { navItemsFor, withUnreadBadge } from "@/components/layout/nav-items";
import { requireUser } from "@/lib/auth/session";
import { getUnreadSummary } from "@/lib/data/unread";
import { createClient } from "@/lib/supabase/server";
import { LogoutForm } from "@/components/offline/logout-form";

// Todo lo que cuelga de (app) exige un perfil activo. La RLS sigue siendo la barrera real.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // El contador de no leídos nunca debe tumbar la pantalla: si falla, simplemente no se muestra.
  const unread = await getUnreadSummary(await createClient()).catch(() => null);
  const items = withUnreadBadge(navItemsFor(user.role), user.role, unread?.totalComments ?? 0);

  return (
    <>
      <OfflineAccount userId={user.id} />
      <AccountBoundary userId={user.id}>
        <WorkoutChangesProvider key={user.id} userId={user.id}>
          <AppChrome
            coach={user.role === "coach"}
            header={
              <header className="app-header border-b bg-card pt-[env(safe-area-inset-top)]">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 md:px-6">
                  <Link
                    href={user.role === "coach" ? "/coach/students" : "/week"}
                    aria-label="Iron Strength, inicio"
                  >
                    <Brand />
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="mr-2 hidden text-right sm:block">
                      <span className="block text-sm font-medium">{user.fullName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {user.role === "coach" ? "Coach" : "Alumno"}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      aria-label="Mi cuenta"
                      render={<Link href="/account" />}
                    >
                      <CircleUser aria-hidden />
                    </Button>
                    <LogoutForm userId={user.id}>
                      <Button type="submit" variant="ghost" aria-label="Cerrar sesión">
                        <LogOut aria-hidden />
                        <span className="hidden sm:inline">Salir</span>
                      </Button>
                    </LogoutForm>
                  </div>
                </div>
              </header>
            }
            nav={<AppNav items={items} />}
          >
            <SyncWorkouts key={user.id} userId={user.id} />
            {children}
          </AppChrome>
        </WorkoutChangesProvider>
      </AccountBoundary>
    </>
  );
}
