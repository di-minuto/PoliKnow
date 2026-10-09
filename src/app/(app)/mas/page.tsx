import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { InstallCard } from "@/components/pwa/install-card";

export const metadata: Metadata = { title: "Más" };

export default function MorePage() {
  const secondary = NAV_ITEMS.filter((i) => !i.primary);
  return (
    <>
      <PageHeader title="Más" />
      <InstallCard />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {secondary.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-4 font-medium"
            >
              <Icon className="size-6 text-primary" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
