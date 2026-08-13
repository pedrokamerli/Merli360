import crypto from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxSizeBytes = 10 * 1024 * 1024;

function safeExt(filename: string, mimeType: string) {
  const ext = path.extname(filename).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(ext)) return ext;
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo obrigatorio." }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Envie PDF ou imagem JPG/PNG/WebP." }, { status: 400 });
  if (file.size > maxSizeBytes) return NextResponse.json({ error: "Arquivo acima de 10MB." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = `${crypto.randomUUID()}${safeExt(file.name, file.type)}`;
  const dir = path.join(process.cwd(), "data", "uploads", user.tenantId);
  const storagePath = path.join(dir, filename);
  await mkdir(dir, { recursive: true });
  await writeFile(storagePath, bytes);

  const item = await prisma.attachment.create({
    data: {
      tenantId: user.tenantId,
      filename,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storagePath,
      linkedModel: String(form.get("linkedModel") || "") || null,
      linkedId: String(form.get("linkedId") || "") || null,
      createdById: user.id
    }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "upload",
    entity: "attachments",
    entityId: item.id,
    request,
    metadata: { originalName: file.name, sizeBytes: file.size, linkedModel: item.linkedModel, linkedId: item.linkedId }
  });

  return NextResponse.json({ item, url: `/api/attachments/${item.id}` });
}
