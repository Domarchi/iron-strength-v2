"use client";
import { useEffect } from "react";
import { setOfflineAccount } from "@/lib/offline/account";
export function OfflineAccount({ userId }: { userId: string | null }) {
  useEffect(() => {
    setOfflineAccount(userId);
  }, [userId]);
  return null;
}
