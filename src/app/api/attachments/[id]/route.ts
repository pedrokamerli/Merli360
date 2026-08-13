import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  const { id } = await context.params;
  const attachment = await prisma.attachment.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!attachment) return NextResponse.json({ error: "Comprovante nao encontrado." }, { status: 404 });

  const bytes = await readFile(attachment.storagePath);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.originalName.replaceAll('"', "")}"`,
      "Cache-Control": "private, max-age=3600"
    }
  });
}
