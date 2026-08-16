import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getGraphicRole, hasGraphicAccess, hasGraphicWorkspaceAccess, type GraphicWorkspace } from "@/lib/graphic";
import { GestaoGraficaWorkspace } from "@/components/GestaoGraficaWorkspace";
import { GraphicAdministrativeWorkspace } from "@/components/GraphicAdministrativeWorkspace";

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
  if (resolvedWorkspace === "administrative") return <GraphicAdministrativeWorkspace />;
  return <GestaoGraficaWorkspace workspace={resolvedWorkspace === "sales" ? "commercial" : resolvedWorkspace} scope={resolvedWorkspace === "sales" ? "mine" : "all"} />;
}
