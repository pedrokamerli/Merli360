import { EntityManager } from "@/components/EntityManager";
import { modelConfigs } from "@/lib/models";

export const dynamic = "force-dynamic";

export default function Page() {
  return <EntityManager config={modelConfigs.financialAccounts} />;
}
