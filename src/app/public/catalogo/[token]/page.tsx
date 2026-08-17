import { notFound } from "next/navigation";
import { GraphicPublicCatalog } from "@/components/GraphicPublicCatalog";
import { GRAPHIC_CATALOG_TOKEN_KEY } from "@/lib/graphic-catalog";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicCatalogPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = prisma as any;
  const setting = await db.graphicSetting.findFirst({
    where: { key: GRAPHIC_CATALOG_TOKEN_KEY, value: token, status: "ACTIVE" },
    include: { tenant: true }
  });
  if (!setting) notFound();
  const items = await db.graphicCatalogItem.findMany({
    where: { tenantId: setting.tenantId, status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      variants: {
        where: { status: "ACTIVE" },
        orderBy: [{ quantity: "asc" }, { widthMm: "asc" }, { heightMm: "asc" }, { label: "asc" }],
        select: { id: true, label: true, widthMm: true, heightMm: true, quantity: true, priceCents: true }
      }
    }
  });
  return <GraphicPublicCatalog tenantName={setting.tenant?.brandName || setting.tenant?.name || "Studium"} token={token} items={JSON.parse(JSON.stringify(items))} />;
}
