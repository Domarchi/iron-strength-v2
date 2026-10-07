import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/layout/app-nav";
import { navItemsFor } from "@/components/layout/nav-items";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "../(auth)/actions";

// Todo lo que cuelga de (app) exige un perfil activo. La RLS sigue siendo la barrera real.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-16 md:pb-0">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <span className="font-bold tracking-tight">IRON STRENGTH</span>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.fullName}</span>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" aria-label="Cerrar sesión">
                <LogOut aria-hidden />
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </form>
          </div>
        </div>
        <div className="mx-auto hidden max-w-5xl px-4 md:block">
          <AppNav items={navItemsFor(user.role)} />
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
      <div className="md:hidden">
        <AppNav items={navItemsFor(user.role)} />
      </div>
    </div>
  );
}
