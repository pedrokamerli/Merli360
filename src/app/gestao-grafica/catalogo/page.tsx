import { redirect } from "next/navigation";
import { GraphicCatalogWorkspace } from "@/components/GraphicCatalogWorkspace";
import { requireUser } from "@/lib/auth";
import { hasGraphicCommercialAccess } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export default async function GraphicCatalogPage() {
  const user = await requireUser();
  if (!hasGraphicCommercialAccess(user)) redirect("/");
  return <GraphicCatalogWorkspace />;
}
