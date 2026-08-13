import { EntityManager } from "@/components/EntityManager";
import { modelConfigs } from "@/lib/models";

export default function Page() {
  return (
    <div className="space-y-6">
      <EntityManager config={modelConfigs.categories} />
      <EntityManager config={modelConfigs.costCenters} />
    </div>
  );
}
