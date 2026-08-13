import { NextRequest, NextResponse } from "next/server";
import { formatReportValue, getReportRows, getSelectedColumns, reportConfigs } from "@/lib/reports";
import { requireApiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function GET(request: NextRequest, context: { params: Promise<{ model: string }> }) {
  const user = await requireApiUser();
  const { model } = await context.params;
  const month = request.nextUrl.searchParams.get("month") || "";
  const rows = await getReportRows(model, user.tenantId, month);
  const config = reportConfigs[model as keyof typeof reportConfigs];
  if (!rows || !config) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  const status = request.nextUrl.searchParams.get("status") || "";
  const category = normalizeText(request.nextUrl.searchParams.get("category") || "");
  const columns = getSelectedColumns(model, request.nextUrl.searchParams.get("columns"));

  const filtered = rows.filter((row: Record<string, unknown>) => {
    if (month) {
      const dateValue = row.date || row.referenceMonth || row.dueDate || row.expectedIssueDate || row.createdAt;
      const text = dateValue instanceof Date ? dateValue.toISOString().slice(0, 7) : String(dateValue ?? "").slice(0, 7);
      if (text !== month) return false;
    }
    if (status && String(row.status ?? "") !== status) return false;
    if (category) {
      const haystack = normalizeText([
        row.category,
        row.description,
        row.accountName,
        row.contactName,
        row.costCenter,
        row.directionLabel
      ].filter(Boolean).join(" "));
      if (!haystack.includes(category)) return false;
    }
    return true;
  });

  return NextResponse.json({
    title: config.title,
    columns: columns.map(([key, label]) => ({ key, label })),
    rows: filtered.map((row: Record<string, unknown>) =>
      Object.fromEntries(columns.map(([key]) => [key, formatReportValue(key, row[key])]))
    )
  });
}
