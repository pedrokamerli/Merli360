import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getGraphicRole, hasGraphicAccess } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  if (!hasGraphicAccess(user)) redirect("/");
  const role = await getGraphicRole(user);
  const destination = role === "GRAPHIC_ADMIN" ? "/gestao-grafica/administrative"
    : role === "GRAPHIC_OPERATIONS" ? "/gestao-grafica/operations"
      : role === "GRAPHIC_ADVISOR" ? "/gestao-grafica/management"
        : "/gestao-grafica/commercial";
  redirect(destination);
}
