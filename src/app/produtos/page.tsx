import { EntityManager } from "@/components/EntityManager";
import { modelConfigs } from "@/lib/models";

export default function Page() {
  return <EntityManager config={modelConfigs.products} />;
}
