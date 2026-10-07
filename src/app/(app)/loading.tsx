export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <div className="h-7 w-40 animate-pulse rounded-md bg-muted" aria-hidden />
      <div className="h-24 animate-pulse rounded-lg bg-muted" aria-hidden />
      <div className="h-24 animate-pulse rounded-lg bg-muted" aria-hidden />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
