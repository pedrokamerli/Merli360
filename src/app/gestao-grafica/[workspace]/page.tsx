import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getGraphicRole, hasGraphicAccess, hasGraphicWorkspaceAccess, type GraphicWorkspace } from "@/lib/graphic";
import { GestaoGraficaWorkspace } from "@/components/GestaoGraficaWorkspace";
import { GraphicAdministrativeWorkspaceV2 } from "@/components/GraphicAdministrativeWorkspaceV2";
import { GraphicCommercialWorkspaceV2 } from "@/components/GraphicCommercialWorkspaceV2";

const workspaceAliases: Record<string, GraphicWorkspace> = {
  comercial: "commercial",
  "minhas-vendas": "sales",
  administrativo: "administrative",
  operacao: "operations",
  gestao: "management",
  configuracoes: "settings",
  commercial: "commercial",
  sales: "sales",
  administrative: "administrative",
  operations: "operations",
  management: "management",
  settings: "settings"
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const resolvedWorkspace = workspaceAliases[workspace];
  if (!resolvedWorkspace) notFound();
  const user = await requireUser();
  if (!hasGraphicAccess(user)) redirect("/");
  const role = await getGraphicRole(user);
  if (!hasGraphicWorkspaceAccess(role, resolvedWorkspace)) redirect("/gestao-grafica");
  if (resolvedWorkspace === "commercial") redirect("/crm?area=grafica");
  if (resolvedWorkspace === "administrative") return <GraphicAdministrativeWorkspaceV2 />;
  if (resolvedWorkspace === "sales") return <GraphicCommercialWorkspaceV2 scope="mine" />;
  return <GestaoGraficaWorkspace workspace={resolvedWorkspace} scope="all" />;
}
