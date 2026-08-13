import { EntityManager } from "@/components/EntityManager";
import { GenerateReceivablesButton } from "@/components/GenerateReceivablesButton";
import { modelConfigs } from "@/lib/models";

export default function Page() {
  return (
    <div className="space-y-4">
      <GenerateReceivablesButton />
      <EntityManager config={modelConfigs.receivables} />
    </div>
  );
}
