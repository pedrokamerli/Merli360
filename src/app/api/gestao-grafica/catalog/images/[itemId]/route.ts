import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { isGraphicCatalogImagePath } from "@/lib/graphic-catalog-images";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId } = await params;
    const item = await (prisma as any).graphicCatalogItem.findFirst({
      where: { id: itemId, status: "ACTIVE" },
      select: { tenantId: true, imageStoragePath: true, imageMimeType: true }
    });
    if (!item?.imageStoragePath || !isGraphicCatalogImagePath(item.imageStoragePath, item.tenantId)) return new NextResponse(null, { status: 404 });
    const data = await readFile(item.imageStoragePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": item.imageMimeType || "application/octet-stream",
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
      }
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
