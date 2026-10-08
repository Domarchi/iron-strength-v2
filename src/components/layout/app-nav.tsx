"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
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
  week: CalendarDays,
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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:bg-transparent md:pb-0 md:backdrop-blur-none"
    >
      <ul className="mx-auto flex max-w-5xl justify-around md:justify-start md:gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? Dumbbell;
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 md:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-2 text-xs font-medium text-muted-foreground transition-colors md:min-h-11 md:flex-row md:gap-2 md:rounded-lg md:px-3 md:text-sm",
                  "hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  active && "text-primary md:bg-muted",
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
