import type { ReactNode } from "react";
import { BottomNav, SideNav } from "@/components/layout/app-nav";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { getCurrentUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <>
      <OfflineBanner />
      <div className="mx-auto flex min-h-dvh max-w-6xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border px-3 py-6 md:flex">
          <p className="mb-6 px-3 text-lg font-bold">Estudio</p>
          <SideNav />
          <p className="mt-auto truncate px-3 text-xs text-muted" title={user.email ?? undefined}>
            {user.email}
          </p>
        </aside>
        <main className="min-w-0 flex-1 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-28 md:px-8 md:pb-10">
          {children}
        </main>
        <BottomNav />
      </div>
    </>
  );
}
