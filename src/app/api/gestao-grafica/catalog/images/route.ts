import crypto from "crypto";
import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assertGraphicPermission } from "@/lib/graphic";
import {
  graphicCatalogImageDirectory,
  graphicCatalogImageExtension,
  isGraphicCatalogImagePath,
  validateGraphicCatalogImage
} from "@/lib/graphic-catalog-images";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let newStoragePath = "";
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "catalog:manage");
    const form = await request.formData();
    const itemId = String(form.get("catalogItemId") || "");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma foto para o produto." }, { status: 400 });
    const validation = validateGraphicCatalogImage(file);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });

    const db = prisma as any;
    const item = await db.graphicCatalogItem.findFirst({ where: { id: itemId, tenantId: user.tenantId } });
    if (!item) return NextResponse.json({ error: "Produto do catalogo nao encontrado." }, { status: 404 });

    const directory = graphicCatalogImageDirectory(user.tenantId);
    await mkdir(directory, { recursive: true });
    newStoragePath = path.join(directory, `${item.id}-${crypto.randomUUID()}${graphicCatalogImageExtension(file.type)}`);
    await writeFile(newStoragePath, Buffer.from(await file.arrayBuffer()));
    const imageUrl = `/api/gestao-grafica/catalog/images/${item.id}`;
    const updated = await db.graphicCatalogItem.update({
      where: { id: item.id },
      data: {
        imageUrl,
        imageStoragePath: newStoragePath,
        imageMimeType: file.type,
        imageOriginalName: file.name,
        updatedById: user.id
      }
    });
    if (item.imageStoragePath && item.imageStoragePath !== newStoragePath && isGraphicCatalogImagePath(item.imageStoragePath, user.tenantId)) {
      await unlink(item.imageStoragePath).catch(() => undefined);
    }
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_upload_catalog_image", entity: "GraphicCatalogItem", entityId: item.id, request, metadata: { originalName: file.name, mimeType: file.type, size: file.size } });
    return NextResponse.json({ item: updated, imageUrl });
  } catch (error: any) {
    if (newStoragePath) await unlink(newStoragePath).catch(() => undefined);
    const status = error?.message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN_MODULE", "FORBIDDEN_GRAPHIC_PERMISSION"].includes(error?.message) ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Somente a administracao pode alterar as fotos do catalogo." : "Nao foi possivel salvar a foto do catalogo." }, { status });
  }
}
