import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseTiendanubeCatalog } from "../src/lib/graphic-catalog-import";

const prisma = new PrismaClient();

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Informe o CSV exportado da Tiendanube.");
  const fullPath = path.resolve(filePath);
  const catalog = parseTiendanubeCatalog(fs.readFileSync(fullPath));
  if (!catalog.length) throw new Error("Nenhum produto de catalogo encontrado no CSV.");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "studium" } });
  if (!tenant) throw new Error("Tenant Studium nao encontrado.");
  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: "studium" } });
  if (!user) throw new Error("Usuario studium nao encontrado.");
  const products = await prisma.graphicProduct.findMany({ where: { tenantId: tenant.id, status: "ACTIVE" }, select: { id: true, name: true } });
  const productIds = new Map(products.map((product) => [normalize(product.name), product.id]));

  let variants = 0;
  await prisma.$transaction(async (tx) => {
    for (const source of catalog) {
      const item = await tx.graphicCatalogItem.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: source.slug } },
        update: {
          name: source.name,
          category: source.category,
          description: source.description,
          imageUrl: source.imageUrl,
          imagePosition: source.imagePosition,
          status: source.status,
          featured: source.featured,
          sortOrder: source.sortOrder,
          source: `TIENDANUBE:${path.basename(fullPath)}`,
          updatedById: user.id
        },
        create: {
          tenantId: tenant.id,
          slug: source.slug,
          name: source.name,
          category: source.category,
          description: source.description,
          imageUrl: source.imageUrl,
          imagePosition: source.imagePosition,
          status: source.status,
          featured: source.featured,
          sortOrder: source.sortOrder,
          source: `TIENDANUBE:${path.basename(fullPath)}`,
          createdById: user.id,
          updatedById: user.id
        }
      });
      await tx.graphicCatalogVariant.deleteMany({ where: { tenantId: tenant.id, catalogItemId: item.id } });
      await tx.graphicCatalogVariant.createMany({
        data: source.variants.map((variant) => ({
          tenantId: tenant.id,
          catalogItemId: item.id,
          productId: variant.productName ? productIds.get(variant.productName) || null : null,
          label: variant.label,
          sku: variant.sku || null,
          option1Name: variant.options[0]?.name || null,
          option1Value: variant.options[0]?.value || null,
          option2Name: variant.options[1]?.name || null,
          option2Value: variant.options[1]?.value || null,
          option3Name: variant.options[2]?.name || null,
          option3Value: variant.options[2]?.value || null,
          widthMm: variant.widthMm,
          heightMm: variant.heightMm,
          quantity: variant.quantity,
          priceCents: variant.priceCents,
          costCents: variant.costCents,
          sourcePriceCents: variant.sourcePriceCents,
          validationStatus: variant.validationStatus,
          status: "ACTIVE",
          sourceData: variant.sourceData,
          createdById: user.id,
          updatedById: user.id
        }))
      });
      variants += source.variants.length;
    }
    await tx.graphicSetting.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "catalogPublicToken" } },
      update: {},
      create: { tenantId: tenant.id, key: "catalogPublicToken", value: crypto.randomBytes(24).toString("base64url"), status: "ACTIVE", createdById: user.id, updatedById: user.id }
    });
  });

  console.log(JSON.stringify({ tenant: tenant.name, products: catalog.length, activeProducts: catalog.filter((item) => item.status === "ACTIVE").length, variants }, null, 2));
}

main().finally(() => prisma.$disconnect());
