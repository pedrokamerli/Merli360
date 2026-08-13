import { GraficaCrmWorkspace } from "@/components/GraficaCrmWorkspace";
import { requireUser } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/crm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  if (!hasModuleAccess(user, "crm")) redirect("/");
  return <GraficaCrmWorkspace />;
}
