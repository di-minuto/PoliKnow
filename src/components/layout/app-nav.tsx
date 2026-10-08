"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Barra lateral en escritorio/tablet. */
export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-primary-soft/60 hover:text-foreground"
            }`}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra inferior en móvil: secciones principales + "Más". */
export function BottomNav() {
  const pathname = usePathname();
  const primary = NAV_ITEMS.filter((i) => i.primary);
  const inSecondary = !primary.some((i) => isActive(pathname, i.href));

  const items = [...primary, { href: "/mas", label: "Más", icon: Menu }];

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/mas" ? inSecondary : isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-primary" : "text-muted"
                }`}
              >
                <Icon className="size-6" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
