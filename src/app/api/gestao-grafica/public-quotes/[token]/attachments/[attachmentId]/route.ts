import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { canDisplayGraphicAttachmentInline, graphicAttachmentContentType, isGraphicAttachmentPath } from "@/lib/graphic-attachments";
import { findPublicGraphicAttachment } from "@/lib/graphic-public-quote";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; attachmentId: string }> }) {
  try {
    const { token, attachmentId } = await params;
    const result = await findPublicGraphicAttachment(token, attachmentId);
    if (!result || !isGraphicAttachmentPath(result.attachment.storagePath, result.quote.tenantId)) return new NextResponse(null, { status: 404 });
    const bytes = await readFile(result.attachment.storagePath);
    const contentType = graphicAttachmentContentType(result.attachment.originalName, result.attachment.mimeType);
    const disposition = canDisplayGraphicAttachmentInline(result.attachment.originalName, result.attachment.mimeType) ? "inline" : "attachment";
    const fallbackName = result.attachment.originalName.replace(/[^\x20-\x7E]/g, "_").replace(/[\r\n"]/g, "_");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(result.attachment.originalName)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"
      }
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
