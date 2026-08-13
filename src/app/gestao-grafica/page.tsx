import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasGraphicAccess } from "@/lib/graphic";
import { GestaoGraficaWorkspace } from "@/components/GestaoGraficaWorkspace";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  if (!hasGraphicAccess(user)) redirect("/");
  return <GestaoGraficaWorkspace />;
}
