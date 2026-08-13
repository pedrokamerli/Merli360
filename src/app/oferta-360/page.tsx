import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const services = [
  "Diagnóstico do negócio",
  "Análise de vendas e dados",
  "Estudo de concorrência",
  "Estratégia de conteúdo",
  "Gestão de Instagram",
  "Google Business",
  "Meta Ads",
  "Google Ads",
  "Relatórios mensais",
  "Planejamento de ofertas",
  "Suporte para delivery/iFood",
  "Avaliação de cardápio, preços e produtos",
  "Consultoria estratégica para crescimento"
];

export default async function Page() {
  const plans = await prisma.servicePlan.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-5">
      <header className="rounded border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Oferta 360</p>
        <h1 className="mt-2 text-3xl font-bold">Consultoria digital 360 para negócios locais</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Meu posicionamento não é apenas criar artes bonitas ou reels. Eu atuo como consultor digital 360 para negócios locais.
        </p>
      </header>

      <section className="rounded border border-line bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">Serviços</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <div key={service} className="rounded border border-line bg-panel p-3 text-sm font-semibold">{service}</div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded border border-line bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-accent">{plan.priceRange}</p>
            <h2 className="mt-2 text-xl font-bold">{plan.name}</h2>
            <p className="mt-3 text-sm text-muted">{plan.audience}</p>
            <div className="mt-4">
              <p className="text-sm font-bold">Inclui</p>
              <p className="mt-1 text-sm leading-6 text-muted">{plan.includes}</p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
