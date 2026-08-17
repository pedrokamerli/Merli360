"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GlobalAssistantButton } from "@/components/GlobalAssistantButton";
import { RoleTutorial } from "@/components/RoleTutorial";
import { PwaBoot } from "@/components/PwaBoot";
import { Sidebar } from "@/components/Sidebar";
import type { SidebarUser } from "@/components/Sidebar";
import { hasGrantedModule } from "@/lib/module-access";

export function AuthenticatedAppShell({ user, children }: { user: SidebarUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hasFinance = user.role === "superadmin" || hasGrantedModule(user.moduleAccess, "financeiro");
  const hasCrm = user.role === "superadmin" || hasGrantedModule(user.moduleAccess, "crm");
  const hasGraphic = user.role === "superadmin" || hasGrantedModule(user.moduleAccess, "gestao-grafica");
  const graphicHome = user.graphicRole === "GRAPHIC_ADMIN" ? "/gestao-grafica/administrativo" : user.graphicRole === "GRAPHIC_ADVISOR" ? "/gestao-grafica/gestao" : "/gestao-grafica/operacao";
  const fallback = hasCrm ? "/crm" : hasGraphic ? graphicHome : "/login";
  const isPublic = pathname.startsWith("/public/") || pathname.startsWith("/q/") || pathname === "/login" || pathname === "/primeiro-acesso";
  const allowed = isPublic
    || (pathname.startsWith("/crm") && hasCrm)
    || (pathname === "/gestao-grafica/catalogo" && (hasCrm || hasGraphic))
    || (pathname.startsWith("/gestao-grafica/clientes/") && (hasCrm || hasGraphic))
    || (pathname.startsWith("/gestao-grafica") && hasGraphic)
    || (pathname === "/configuracoes" && (hasFinance || hasCrm))
    || (pathname === "/usuarios" && user.role === "superadmin")
    || (!pathname.startsWith("/crm") && !pathname.startsWith("/gestao-grafica") && pathname !== "/configuracoes" && pathname !== "/usuarios" && hasFinance);

  useEffect(() => { if (!allowed) router.replace(fallback); }, [allowed, fallback, router]);
  if (pathname.startsWith("/public/")) return <>{children}</>;
  if (!allowed) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><p className="text-sm font-bold text-slate-600">Abrindo sua area de trabalho...</p></main>;

  return <div className="app-shell min-h-screen">
    <PwaBoot />
    <Sidebar user={user} />
    {pathname !== "/gestao-grafica/catalogo" ? <RoleTutorial user={user} /> : null}
    <main className="min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
    <GlobalAssistantButton />
  </div>;
}
