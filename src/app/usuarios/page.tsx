import { UsersAdmin } from "@/components/UsersAdmin";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireSuperAdmin();
  return <UsersAdmin />;
}
