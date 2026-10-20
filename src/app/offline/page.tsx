import { OfflineApp } from "@/components/offline/offline-app";
export const metadata = { title: "Sin conexión · Iron Strength" };
export default function OfflinePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 min-h-dvh">
      <OfflineApp />
    </main>
  );
}
