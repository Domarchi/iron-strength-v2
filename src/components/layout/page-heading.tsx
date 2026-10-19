export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  eyebrow: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-tight font-bold tracking-tight">{title}</h1>
        {action}
      </div>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}
