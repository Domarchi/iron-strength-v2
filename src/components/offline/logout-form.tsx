"use client";
import { logoutAction } from "@/app/(auth)/actions";
import { setOfflineAccount } from "@/lib/offline/account";
// Oculta la cuenta local antes de enviar el cierre, incluso si se pierde su respuesta.
export function LogoutForm({ children }: { children: React.ReactNode }) {
  return (
    <form action={logoutAction} onSubmit={() => setOfflineAccount(null)}>
      {children}
    </form>
  );
}
