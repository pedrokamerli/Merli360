import { hostTenantKind } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const kind = await hostTenantKind();
  const brand = kind === "agro" ? "Gestao Rural 360" : "Merli360";
  const subtitle = kind === "agro" ? "Controle rural, vendas, producao e financeiro" : "Gestao financeira e comercial";

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <form action="/api/login" method="post" className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-6 shadow-2xl">
        <div className="mb-6">
          <p className="eyebrow">{brand}</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Entrar</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {params.error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            Usuario ou senha invalidos.
          </div>
        ) : null}
        <div className="space-y-4">
          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">Usuario</span>
            <input name="username" autoComplete="username" className="form-control" required />
          </label>
          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">Senha</span>
            <input name="password" type="password" autoComplete="current-password" className="form-control" required />
          </label>
          <button className="primary-action w-full justify-center" type="submit">
            Acessar
          </button>
        </div>
      </form>
    </main>
  );
}
