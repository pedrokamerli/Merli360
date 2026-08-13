import { EntityManager } from "@/components/EntityManager";
import { FinancialTitlesWorkspace } from "@/components/FinancialTitlesWorkspace";
import { modelConfigs } from "@/lib/models";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <FinancialTitlesWorkspace />
      <EntityManager config={modelConfigs.financialTitles} />
      <EntityManager config={modelConfigs.settlements} />
      <EntityManager config={modelConfigs.cashMovements} />
    </div>
  );
}
