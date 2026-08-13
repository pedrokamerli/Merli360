import { prisma } from "@/lib/prisma";

function dateOnly(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

async function recalcProductStock(productId: string) {
  const movements = await prisma.stockMovement.findMany({ where: { productId } });
  const currentStock = movements.reduce((sum, movement) => {
    return sum + (movement.type === "entrada" ? movement.quantity : -movement.quantity);
  }, 0);
  await prisma.product.update({ where: { id: productId }, data: { currentStock } });
}

export async function syncHarvestStock(harvest: any) {
  const quantity = Math.max(Number(harvest.quantity || 0) - Number(harvest.lossQuantity || 0), 0);
  await prisma.stockMovement.upsert({
    where: { id: `stock-harvest-${harvest.id}` },
    update: {
      tenantId: harvest.tenantId,
      productId: harvest.productId,
      date: dateOnly(harvest.harvestDate),
      type: "entrada",
      quantity,
      unit: harvest.unit,
      reason: "Colheita",
      referenceId: harvest.id,
      notes: "Entrada automatica gerada pela colheita."
    },
    create: {
      id: `stock-harvest-${harvest.id}`,
      tenantId: harvest.tenantId,
      productId: harvest.productId,
      date: dateOnly(harvest.harvestDate),
      type: "entrada",
      quantity,
      unit: harvest.unit,
      reason: "Colheita",
      referenceId: harvest.id,
      notes: "Entrada automatica gerada pela colheita."
    }
  });

  await prisma.product.update({
    where: { id: harvest.productId },
    data: { averageCost: Number(harvest.unitCost || 0) }
  });
  await recalcProductStock(harvest.productId);
}

export async function syncSaleAutomation(sale: any) {
  const quantity = Number(sale.quantity || 0);
  const totalAmount = Number(sale.totalAmount || 0);
  const saleDate = dateOnly(sale.saleDate);
  const paidDate = sale.paidDate ? dateOnly(sale.paidDate) : saleDate;
  const dueDate = sale.dueDate ? dateOnly(sale.dueDate) : saleDate;
  const paymentMethod = sale.paymentMethod || "Marcar na conta";
  const shouldCreateReceivable = paymentMethod === "Marcar na conta" || !["recebido", "pago"].includes(sale.status);

  await prisma.stockMovement.upsert({
    where: { id: `stock-sale-${sale.id}` },
    update: {
      tenantId: sale.tenantId,
      productId: sale.productId,
      date: saleDate,
      type: "saida",
      quantity,
      unit: sale.unit,
      reason: "Venda",
      referenceId: sale.id,
      notes: "Saida automatica gerada pela venda."
    },
    create: {
      id: `stock-sale-${sale.id}`,
      tenantId: sale.tenantId,
      productId: sale.productId,
      date: saleDate,
      type: "saida",
      quantity,
      unit: sale.unit,
      reason: "Venda",
      referenceId: sale.id,
      notes: "Saida automatica gerada pela venda."
    }
  });

  await recalcProductStock(sale.productId);

  const product = await prisma.product.findUnique({ where: { id: sale.productId } });
  const buyer = sale.buyerId ? await prisma.buyer.findUnique({ where: { id: sale.buyerId } }) : null;
  const label = `${product?.name || "Produto"} - ${buyer?.name || "comprador"}`;

  if (!shouldCreateReceivable) {
    await prisma.transaction.upsert({
      where: { importHash: `sale-paid-${sale.id}` },
      update: {
        tenantId: sale.tenantId,
        date: paidDate,
        description: `Venda recebida - ${label}`,
        amount: totalAmount,
        type: "entrada",
        category: product?.category === "legume" ? "Vendas de legumes" : "Vendas de hortalicas",
        subcategory: buyer?.type,
        costCenter: "Rural",
        account: sale.account || "PJ",
        status: "pago",
        paymentMethod,
        notes: "Lancamento automatico gerado pela venda rural.",
        source: "Gestao Rural 360"
      },
      create: {
        tenantId: sale.tenantId,
        date: paidDate,
        description: `Venda recebida - ${label}`,
        amount: totalAmount,
        type: "entrada",
        category: product?.category === "legume" ? "Vendas de legumes" : "Vendas de hortalicas",
        subcategory: buyer?.type,
        costCenter: "Rural",
        account: sale.account || "PJ",
        status: "pago",
        paymentMethod,
        notes: "Lancamento automatico gerado pela venda rural.",
        source: "Gestao Rural 360",
        importHash: `sale-paid-${sale.id}`
      }
    });
    await prisma.accountReceivable.deleteMany({
      where: { tenantId: sale.tenantId, notes: { contains: `venda rural ${sale.id}` }, status: { not: "pago" } }
    });
  } else {
    await prisma.transaction.deleteMany({ where: { importHash: `sale-paid-${sale.id}` } });
    await prisma.accountReceivable.upsert({
      where: { id: `sale-receivable-${sale.id}` },
      update: {
        tenantId: sale.tenantId,
        description: `Venda a receber - ${label}`,
        amount: totalAmount,
        dueDate,
        status: "pendente",
        type: "venda rural",
        notes: `Gerado automaticamente pela venda rural ${sale.id}.`
      },
      create: {
        id: `sale-receivable-${sale.id}`,
        tenantId: sale.tenantId,
        description: `Venda a receber - ${label}`,
        amount: totalAmount,
        dueDate,
        status: "pendente",
        type: "venda rural",
        notes: `Gerado automaticamente pela venda rural ${sale.id}.`
      }
    });
  }
}
