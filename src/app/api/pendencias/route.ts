import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getPendingCenter } from "@/lib/pending-center";

export async function GET() {
  try {
    const user = await requireApiUser();
    const data = await getPendingCenter(user.tenantId, {
      userId: user.id,
      tenantKind: user.tenant.kind
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
    }
    return NextResponse.json({ error: "Nao foi possivel carregar pendencias." }, { status: 500 });
  }
}
