import { EntityManager } from "@/components/EntityManager";
import { modelConfigs } from "@/lib/models";

export default function Page() {
  return (
    <div className="space-y-4">
      <section className="rounded border border-line bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">Cenários de crescimento</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded border border-line bg-panel p-4">Para R$ 5.000: faltam R$ 1.950</div>
          <div className="rounded border border-line bg-panel p-4">Caminho 1: 4 clientes de R$ 500</div>
          <div className="rounded border border-line bg-panel p-4">Caminho 2: 3 clientes de R$ 700</div>
          <div className="rounded border border-line bg-panel p-4">Caminho 3: 2 clientes de R$ 1.000</div>
        </div>
      </section>
      <EntityManager config={modelConfigs.goals} />
    </div>
  );
}
