import crypto from "crypto";
import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission } from "@/lib/graphic";
import { graphicAttachmentDirectory, isGraphicAttachmentModel, normalizeGraphicPurpose, safeGraphicAttachmentExt, validateGraphicAttachment } from "@/lib/graphic-attachments";

export const dynamic = "force-dynamic";

const modelMap: Record<string, string> = {
  quote: "graphicQuote",
  order: "graphicOrder",
  production: "graphicProductionOrder",
  delivery: "graphicDelivery",
  "post-sale": "graphicPostSale",
  opportunity: "graphicOpportunity"
};

async function assertLinkedRecord(db: any, tenantId: string, linkedModel: string, linkedId: string) {
  const model = modelMap[linkedModel];
  if (!model) return null;
  return db[model].findFirst({ where: { id: linkedId, tenantId }, select: { id: true } });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "report:view");
    const linkedModel = String(request.nextUrl.searchParams.get("linkedModel") || "");
    const linkedId = String(request.nextUrl.searchParams.get("linkedId") || "");
    if (!isGraphicAttachmentModel(linkedModel) || !linkedId) return NextResponse.json({ error: "Informe o vinculo do arquivo." }, { status: 400 });
    const db = prisma as any;
    const linked = await assertLinkedRecord(db, user.tenantId, linkedModel, linkedId);
    if (!linked) return NextResponse.json({ error: "Registro vinculado nao encontrado." }, { status: 404 });
    const items = await db.graphicAttachment.findMany({
      where: { tenantId: user.tenantId, linkedModel, linkedId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" }
    });
    const attachments = await db.attachment.findMany({ where: { tenantId: user.tenantId, id: { in: items.map((item: any) => item.attachmentId) } } });
    const byId = new Map(attachments.map((item: any) => [item.id, item]));
    return NextResponse.json({ items: items.map((item: any) => ({ ...item, attachment: byId.get(item.attachmentId), url: `/api/attachments/${item.attachmentId}` })) });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite consultar arquivos da grafica." : "Nao foi possivel carregar arquivos da grafica.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}

export async function POST(request: NextRequest) {
  let storagePath = "";
  let committed = false;
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "production:update");
    const form = await request.formData();
    const file = form.get("file");
    const linkedModel = String(form.get("linkedModel") || "");
    const linkedId = String(form.get("linkedId") || "");
    const purpose = normalizeGraphicPurpose(form.get("purpose"));
    if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo obrigatorio." }, { status: 400 });
    if (!isGraphicAttachmentModel(linkedModel) || !linkedId) return NextResponse.json({ error: "Informe onde o arquivo sera anexado." }, { status: 400 });
    const validation = validateGraphicAttachment(file);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });

    const db = prisma as any;
    const linked = await assertLinkedRecord(db, user.tenantId, linkedModel, linkedId);
    if (!linked) return NextResponse.json({ error: "Registro vinculado nao encontrado." }, { status: 404 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const filename = `${crypto.randomUUID()}${safeGraphicAttachmentExt(file.name, file.type)}`;
    const dir = graphicAttachmentDirectory(user.tenantId);
    storagePath = path.join(dir, filename);
    await mkdir(dir, { recursive: true });
    await writeFile(storagePath, bytes);

    const production = linkedModel === "production"
      ? await db.graphicProductionOrder.findFirst({ where: { id: linkedId, tenantId: user.tenantId }, select: { checklist: true } })
      : null;

    const result = await db.$transaction(async (tx: any) => {
      const attachment = await tx.attachment.create({
        data: {
          tenantId: user.tenantId,
          filename,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          storagePath,
          linkedModel: `Graphic:${linkedModel}`,
          linkedId,
          createdById: user.id
        }
      });
      const graphicAttachment = await tx.graphicAttachment.create({
        data: { tenantId: user.tenantId, attachmentId: attachment.id, linkedModel, linkedId, purpose, createdById: user.id, updatedById: user.id }
      });
      if (linkedModel === "delivery" && purpose === "DELIVERY_PROOF") {
        await tx.graphicDelivery.update({
          where: { id: linkedId },
          data: { proofAttachmentId: attachment.id, updatedById: user.id }
        });
      }
      if (linkedModel === "production" && production) {
        const checklist = (() => { try { return JSON.parse(production.checklist || "{}"); } catch { return {}; } })();
        const isFinalArtwork = ["FINAL_ARTWORK", "PROOF"].includes(purpose);
        const hasCustomerFiles = ["ARTWORK", "CUSTOMER_ARTWORK", "LOGO", "DOCUMENT", "OTHER"].includes(purpose);
        await tx.graphicProductionOrder.update({
          where: { id: linkedId },
          data: { checklist: JSON.stringify({ ...checklist, ...(hasCustomerFiles ? { arquivos: true } : {}), ...(isFinalArtwork ? { arte: false } : {}) }), updatedById: user.id }
        });
        await tx.graphicProductionEvent.create({
          data: {
            tenantId: user.tenantId,
            productionOrderId: linkedId,
            userId: user.id,
            action: isFinalArtwork ? "FINAL_ARTWORK_UPLOADED" : "PRODUCTION_FILE_UPLOADED",
            note: `${isFinalArtwork ? "Arte final" : "Arquivo"} anexado: ${file.name}`,
            evidenceAttachmentId: attachment.id,
            createdById: user.id,
            updatedById: user.id
          }
        });
      }
      return { attachment, graphicAttachment };
    });

    committed = true;
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_upload_attachment", entity: "GraphicAttachment", entityId: result.graphicAttachment.id, request, metadata: { linkedModel, linkedId, purpose, originalName: file.name, sizeBytes: file.size } });
    return NextResponse.json({ item: result.graphicAttachment, attachment: result.attachment, url: `/api/attachments/${result.attachment.id}` });
  } catch (error: any) {
    if (storagePath && !committed) await unlink(storagePath).catch(() => undefined);
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite anexar arquivos na grafica." : "Nao foi possivel anexar arquivo da grafica.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "production:update");
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const reason = String(body.reason || "Removido da ficha da grafica.").trim().slice(0, 300);
    if (!id) return NextResponse.json({ error: "Informe o arquivo que sera removido." }, { status: 400 });

    const db = prisma as any;
    const item = await db.graphicAttachment.findFirst({
      where: { id, tenantId: user.tenantId, status: "ACTIVE" }
    });
    if (!item) return NextResponse.json({ error: "Arquivo da grafica nao encontrado." }, { status: 404 });

    const linked = await assertLinkedRecord(db, user.tenantId, item.linkedModel, item.linkedId);
    if (!linked) return NextResponse.json({ error: "Registro vinculado nao encontrado." }, { status: 404 });

    const updated = await db.graphicAttachment.update({
      where: { id: item.id },
      data: { status: "INACTIVE", updatedById: user.id }
    });

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "graphic_remove_attachment",
      entity: "GraphicAttachment",
      entityId: item.id,
      request,
      metadata: { linkedModel: item.linkedModel, linkedId: item.linkedId, attachmentId: item.attachmentId, reason }
    });
    return NextResponse.json({ item: updated });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite remover arquivos da grafica." : "Nao foi possivel remover arquivo da grafica.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
