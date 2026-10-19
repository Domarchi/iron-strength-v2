"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Dumbbell,
  History,
  Library,
  Ruler,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, type NavItem } from "./nav-items";

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  week: Dumbbell,
  history: History,
  progress: TrendingUp,
  body: Ruler,
  students: Users,
  programs: ClipboardList,
  exercises: Library,
};

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:border-b md:pb-0"
    >
      <ul className="mx-auto flex max-w-5xl justify-around">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? Dumbbell;
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 border-t-2 border-transparent px-2 text-xs font-medium text-muted-foreground transition-colors md:min-h-14 md:flex-row md:gap-2 md:border-t-0 md:border-b-2 md:text-sm",
                  "hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  active && "border-primary text-primary",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden />
                  {item.badge ? (
                    <span
                      aria-hidden
                      className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-bold text-primary-foreground"
                    >
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
                {item.badge ? (
                  <span className="sr-only">
                    , {item.badge}{" "}
                    {item.badge === 1 ? "comentario sin leer" : "comentarios sin leer"}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
