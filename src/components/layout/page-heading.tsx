export function PageHeading({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description: string;
  eyebrow: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="pb-2">
      <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
        {eyebrow}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {action}
      </div>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </header>
  );
}
