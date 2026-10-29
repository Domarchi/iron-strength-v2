"use client";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { activeOfflineAccount, subscribeOfflineAccount } from "@/lib/offline/account";
import { Button } from "@/components/ui/button";
import { WebTrainingProvider } from "@/components/training/provider";
import { WebTrainingDownloadProvider } from "./training-download-provider";
import { OfflineTrainingHome } from "./training-home";
export function OfflineApp() {
  const userId = useSyncExternalStore(subscribeOfflineAccount, activeOfflineAccount, () => null);
  if (userId && !z.uuid().safeParse(userId).success)
    return (
      <div className="py-8 space-y-4">
        <h1 className="text-2xl font-semibold">Recupera tu acceso</h1>
        <p role="alert">
          No pudimos identificar la cuenta guardada. Conservamos los datos de este dispositivo.
          Entra con conexión para recuperar tu acceso.
        </p>
        <Button render={<a href="/login" />}>Entrar con conexión</Button>
      </div>
    );
  if (!userId)
    return (
      <div className="py-8 space-y-4">
        <h1 className="text-2xl font-semibold">Entrenamiento sin conexión</h1>
        <p>Entra con conexión y descarga tus entrenamientos para usarlos aquí.</p>
        <Button render={<a href="/login" />}>Entrar</Button>
      </div>
    );
  return (
    <WebTrainingDownloadProvider key={userId} userId={userId}>
      <WebTrainingProvider userId={userId} refreshOnConfirm={false}>
        <OfflineTrainingHome userId={userId} />
      </WebTrainingProvider>
    </WebTrainingDownloadProvider>
  );
}
