"use client";
import { useEffect, useSyncExternalStore } from "react";
import { migrateDrafts } from "@/lib/workout/draft";
import {
  activeOfflineAccount,
  subscribeOfflineAccount,
  setOfflineAccount,
} from "@/lib/offline/account";
export function OfflineAccount({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (userId) {
      try {
        migrateDrafts(localStorage, userId);
      } catch {
        /* Se conserva el origen. */
      }
    }
    setOfflineAccount(userId);
  }, [userId]);
  return null;
}

export function AccountBoundary({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const current = useSyncExternalStore(subscribeOfflineAccount, activeOfflineAccount, () => userId);
  if (current !== userId)
    return (
      <main className="mx-auto max-w-lg p-6 space-y-4">
        <h1 className="text-xl font-semibold">La cuenta cambió en este dispositivo</h1>
        <p>
          Vuelve a entrar para consultar tus datos. Los registros pendientes conservan su cuenta
          original.
        </p>
        <a href="/login" className="inline-flex min-h-11 items-center px-3 text-primary underline">
          Volver a entrar
        </a>
      </main>
    );
  return children;
}
