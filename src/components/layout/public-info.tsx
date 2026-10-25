import type { ReactNode } from "react";

export const SUPPORT_EMAIL = "joaquindomarchi@gmail.com";
export const RESPONSIBLE_NAME = "Joaquín Domarchi";
export const publicInfoLink =
  "inline-flex min-h-11 items-center py-2 font-medium text-primary underline underline-offset-4";

export function SupportEmail() {
  return (
    <a className={`${publicInfoLink} break-all`} href={`mailto:${SUPPORT_EMAIL}`}>
      {SUPPORT_EMAIL}
    </a>
  );
}

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-6">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}
