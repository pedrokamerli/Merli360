"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  user: {
    name: string;
    username: string;
    mustChangePassword: boolean;
    tenant: { brandName: string; kind: string };
  };
};

const controlOptions = [
  "Vida pessoal",
  "Empresa/MEI",
  "Cartao de credito",
  "Contas a pagar",
  "Contas a receber",
  "Vendas",
  "Estoque",
  "Agro/producao rural",
  "Clientes/contratos"
];

const accountOptions = ["PJ", "pessoal", "dinheiro", "cartao", "Santander", "Nubank", "Mercado Pago"];
const cofrinhoOptions = ["Reserva de emergencia", "Investimentos", "Impostos", "Ferias", "Equipamentos", "Capital de giro"];
const agroCropOptions = ["Alface", "Couve", "Cheiro-verde", "Rucula", "Tomate", "Pimentao", "Cenoura", "Beterraba", "Mandioca", "Abobrinha"];
const agroBuyerOptions = ["Mercados", "Distribuidoras", "Restaurantes", "Feiras", "Delivery", "Venda direta", "CEASA/atacado"];
const agroCostOptions = ["Sementes/mudas", "Adubo/fertilizante", "Defensivos", "Irrigacao", "Energia", "Agua", "Combustivel", "Transporte/frete", "Funcionarios/diarias", "Embalagens", "Manutencao de equipamentos", "Ferramentas"];

export function FirstAccessSetupForm({ user }: Props) {
  const isAgro = user.tenant.kind === "agro";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"password" | "setup">("password");
  const [error, setError] = useState("");

  function continueToSetup() {
    setError("");
    if (user.mustChangePassword || password || confirmPassword) {
      if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
      if (password !== confirmPassword) return setError("As senhas nao conferem.");
    }
    setStep("setup");
  }

  return (
    <form action="/api/account/password" method="post" className="surface-panel overflow-hidden">
      <input type="hidden" name="redirectTo" value="/?openAi=1&welcome=1" />
      {step === "setup" ? (
        <>
          <input type="hidden" name="password" value={password} />
          <input type="hidden" name="confirmPassword" value={confirmPassword} />
        </>
      ) : null}

      <div className="border-b border-slate-100 p-5 md:p-7">
        <p className="eyebrow">Primeiro acesso</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950 md:text-3xl">Configure seu acesso e sua IA</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
          Oi, {user.name}. Primeiro resolvemos sua senha. Depois voce configura a IA sem risco de perder o que digitou.
        </p>
      </div>

      <div className="grid gap-6 p-5 md:p-7">
        <section className="grid gap-4">
          <div>
            <p className="eyebrow">Acesso</p>
            <h2 className="text-lg font-black text-slate-950">{user.mustChangePassword ? "Crie sua senha" : "Senha"}</h2>
            {!user.mustChangePassword ? <p className="mt-1 text-sm font-semibold text-slate-500">Se nao quiser trocar agora, deixe em branco e continue.</p> : null}
          </div>
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Usuario</span>
              <input className="form-control" value={user.username} readOnly />
            </label>
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Nova senha</span>
              <input className="form-control" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Confirmar senha</span>
              <input className="form-control" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="secondary-action" onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              {showPassword ? "Ocultar senha" : "Mostrar senha"}
            </button>
            {step === "password" ? (
              <button type="button" className="primary-action" onClick={continueToSetup}>
                Continuar
              </button>
            ) : (
              <button type="button" className="secondary-action" onClick={() => setStep("password")}>
                Editar senha
              </button>
            )}
          </div>
        </section>

        {step === "setup" ? (
          <>
            <section className="grid gap-4">
              <div>
                <p className="eyebrow">Aprendizado da IA</p>
                <h2 className="text-lg font-black text-slate-950">O que voce quer controlar?</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Essas respostas viram memoria, categorias, carteiras e metas para a assistente agir com contexto real.
                </p>
              </div>
              <input type="hidden" name="businessName" value={user.tenant.brandName} />
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  <span className="mb-1 block text-xs font-black uppercase text-slate-500">Profissao / atividade</span>
                  <input name="profession" className="form-control" placeholder={isAgro ? "Ex: produtor rural de hortalicas" : "Ex: consultor digital, CLT, MEI, autonomo..."} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-black uppercase text-slate-500">Renda ou faturamento medio</span>
                  <input name="monthlyIncome" className="form-control" inputMode="decimal" placeholder="Ex: 5000,00" />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {controlOptions.filter((item) => isAgro || item !== "Agro/producao rural").map((option) => (
                  <label key={option} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">
                    <input type="checkbox" name="controlAreas" value={option} defaultChecked={isAgro && ["Agro/producao rural", "Vendas", "Estoque", "Contas a pagar", "Contas a receber"].includes(option)} />
                    {option}
                  </label>
                ))}
              </div>
            </section>

            <section className="grid gap-4">
              <div>
                <p className="eyebrow">Metas</p>
                <h2 className="text-lg font-black text-slate-950">Metas financeiras primeiro</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input name="investmentGoal" className="form-control" placeholder="Meta de investimento. Ex: 500 por mes" />
                <input name="emergencyReserveGoal" className="form-control" placeholder="Reserva desejada. Ex: 10000" />
                <select name="followUpLevel" className="form-control" defaultValue="equilibrado">
                  <option value="leve">Acompanhamento leve</option>
                  <option value="equilibrado">Acompanhamento equilibrado</option>
                  <option value="rigoroso">Acompanhamento rigoroso</option>
                </select>
              </div>
              <textarea name="goalsText" className="form-control min-h-28" placeholder="Ex: guardar R$ 5.000, manter saldo positivo, reduzir gastos, quitar divida, faturar R$ 10.000 por mes..." />
              <textarea name="objectivesText" className="form-control min-h-24" placeholder={isAgro ? "Objetivos de uso: controlar plantio, colheita, custo por cultura, vendas e estoque..." : "Objetivos de uso: separar pessoal da empresa, controlar cartao, organizar clientes, vencimentos e relatorios..."} />
            </section>

            <section className="grid gap-4">
              <div>
                <p className="eyebrow">Cofrinhos</p>
                <h2 className="text-lg font-black text-slate-950">Reservas que voce quer acompanhar</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {cofrinhoOptions.map((cofrinho) => (
                  <div key={cofrinho} className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
                    <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                      <input type="checkbox" name="savingPockets" value={cofrinho} defaultChecked={["Reserva de emergencia", "Investimentos"].includes(cofrinho)} />
                      {cofrinho}
                    </label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input name={`pocket_current_${cofrinho}`} className="form-control" inputMode="decimal" placeholder="Saldo atual. Ex: 100,00" />
                      <input name={`pocket_target_${cofrinho}`} className="form-control" inputMode="decimal" placeholder="Meta. Ex: 5000,00" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input name="customPocket" className="form-control" placeholder="Outro cofrinho" />
                <input name="pocket_current_custom" className="form-control" inputMode="decimal" placeholder="Saldo atual" />
                <input name="pocket_target_custom" className="form-control" inputMode="decimal" placeholder="Meta" />
              </div>
            </section>

            {isAgro ? (
              <section className="grid gap-5 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4 md:p-5">
                <div>
                  <p className="eyebrow text-emerald-700">Gestao rural</p>
                  <h2 className="text-lg font-black text-slate-950">Entender a producao</h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {agroCropOptions.map((crop) => (
                    <label key={crop} className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-white p-3 text-sm font-bold text-slate-700">
                      <input type="checkbox" name="agroCrops" value={crop} />
                      {crop}
                    </label>
                  ))}
                </div>
                <input name="agroOtherCrops" className="form-control" placeholder="Outras culturas. Ex: quiabo, pepino, milho verde..." />
                <div className="grid gap-3 md:grid-cols-2">
                  <input name="agroArea" className="form-control" placeholder="Area plantada / canteiros. Ex: 30 canteiros, 2 hectares..." />
                  <input name="agroHarvestFrequency" className="form-control" placeholder="Frequencia de colheita. Ex: toda semana..." />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {agroBuyerOptions.map((buyer) => (
                    <label key={buyer} className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-white p-3 text-sm font-bold text-slate-700">
                      <input type="checkbox" name="agroBuyers" value={buyer} />
                      {buyer}
                    </label>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {agroCostOptions.map((cost) => (
                    <label key={cost} className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-white p-3 text-sm font-bold text-slate-700">
                      <input type="checkbox" name="agroCosts" value={cost} defaultChecked={["Sementes/mudas", "Adubo/fertilizante", "Transporte/frete"].includes(cost)} />
                      {cost}
                    </label>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <textarea name="agroStockRoutine" className="form-control min-h-24" placeholder="Como controla estoque hoje? Caixas, kg, unidades, perdas..." />
                  <textarea name="agroMainDifficulty" className="form-control min-h-24" placeholder="Maior dificuldade hoje: lucro por cultura, fiado, custo, estoque..." />
                </div>
              </section>
            ) : null}

            <section className="grid gap-4">
              <div>
                <p className="eyebrow">Carteiras</p>
                <h2 className="text-lg font-black text-slate-950">Contas e saldo inicial</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {accountOptions.map((account) => (
                  <div key={account} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                      <input type="checkbox" name="accounts" value={account} defaultChecked={["PJ", "pessoal", "dinheiro"].includes(account)} />
                      {account}
                    </label>
                    <input name={`balance_${account}`} className="form-control mt-2" inputMode="decimal" placeholder="Saldo inicial. Ex: 400,00" />
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input name="customAccount" className="form-control" placeholder="Outra conta/carteira" />
                <input name="balance_custom" className="form-control" inputMode="decimal" placeholder="Saldo da outra conta. Ex: 250,00" />
              </div>
            </section>

            <section className="grid gap-4">
              <div>
                <p className="eyebrow">Rotina</p>
                <h2 className="text-lg font-black text-slate-950">Entradas e despesas comuns</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <textarea name="frequentEntries" className="form-control min-h-24" placeholder={isAgro ? "Ex: vendas para mercados, restaurantes, distribuidoras..." : "Ex: salario, clientes mensais, projetos, reembolsos..."} />
                <textarea name="frequentExpenses" className="form-control min-h-24" placeholder={isAgro ? "Ex: sementes, mudas, adubo, frete, energia, diarias..." : "Ex: mercado, combustivel, aluguel, ferramentas, anuncios..."} />
              </div>
            </section>

            <div className="rounded-3xl bg-violet-50 p-4 text-sm font-bold text-violet-900">
              Depois disso, a IA ja entra configurada para registrar, analisar, importar anexos, criar contas e orientar o uso do SaaS.
            </div>

            <button className="primary-action w-full justify-center py-4 text-base" type="submit">
              Salvar setup e entrar
            </button>
          </>
        ) : null}
      </div>
    </form>
  );
}
