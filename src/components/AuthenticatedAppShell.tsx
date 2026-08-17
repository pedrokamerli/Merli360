"use client";

import { usePathname } from "next/navigation";
import { GlobalAssistantButton } from "@/components/GlobalAssistantButton";
import { OnboardingTour } from "@/components/OnboardingTour";
import { PwaBoot } from "@/components/PwaBoot";
import { Sidebar } from "@/components/Sidebar";
import type { SidebarUser } from "@/components/Sidebar";

export function AuthenticatedAppShell({ user, children }: { user: SidebarUser; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/public/")) return <>{children}</>;

  return <div className="app-shell min-h-screen">
    <PwaBoot />
    <Sidebar user={user} />
    <OnboardingTour brandName={user.tenant.brandName} tenantKind={user.tenant.kind} userName={user.username || user.name} />
    <main className="min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
    <GlobalAssistantButton />
  </div>;
}
