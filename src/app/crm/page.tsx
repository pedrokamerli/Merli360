import { CrmCommandCenter } from "@/components/CrmCommandCenter";
import { requireUser } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/crm";
import { redirect } from "next/navigation";

export default async function Page() {
  const user = await requireUser();
  if (!hasModuleAccess(user, "crm")) redirect("/");
  return <CrmCommandCenter />;
}
