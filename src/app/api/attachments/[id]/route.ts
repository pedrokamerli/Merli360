import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { canDisplayGraphicAttachmentInline, graphicAttachmentContentType } from "@/lib/graphic-attachments";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  const { id } = await context.params;
  const attachment = await prisma.attachment.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!attachment) return NextResponse.json({ error: "Comprovante nao encontrado." }, { status: 404 });

  const tenantUploadDirectory = path.resolve(process.cwd(), "data", "uploads", user.tenantId);
  const resolvedStoragePath = path.resolve(attachment.storagePath);
  if (!resolvedStoragePath.startsWith(`${tenantUploadDirectory}${path.sep}`)) return NextResponse.json({ error: "Arquivo indisponivel." }, { status: 404 });

  const bytes = await readFile(resolvedStoragePath);
  const contentType = graphicAttachmentContentType(attachment.originalName, attachment.mimeType);
  const disposition = canDisplayGraphicAttachmentInline(attachment.originalName, attachment.mimeType) ? "inline" : "attachment";
  const fallbackName = attachment.originalName.replace(/[^\x20-\x7E]/g, "_").replace(/[\r\n"]/g, "_");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox"
    }
  });
}
