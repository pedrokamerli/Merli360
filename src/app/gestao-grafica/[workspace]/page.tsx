import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getGraphicRole, hasGraphicAccess, hasGraphicWorkspaceAccess, type GraphicWorkspace } from "@/lib/graphic";
import { GestaoGraficaWorkspace } from "@/components/GestaoGraficaWorkspace";
import { GraphicAdministrativeWorkspace } from "@/components/GraphicAdministrativeWorkspace";

const validWorkspaces = ["commercial", "administrative", "operations", "management", "settings"] as const;

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  if (!validWorkspaces.includes(workspace as GraphicWorkspace)) notFound();
  const user = await requireUser();
  if (!hasGraphicAccess(user)) redirect("/");
  const role = await getGraphicRole(user);
  if (!hasGraphicWorkspaceAccess(role, workspace as GraphicWorkspace)) redirect("/gestao-grafica");
  if (workspace === "administrative") return <GraphicAdministrativeWorkspace />;
  return <GestaoGraficaWorkspace workspace={workspace as GraphicWorkspace} />;
}
