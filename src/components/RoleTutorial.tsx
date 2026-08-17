"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { SidebarUser } from "@/components/Sidebar";

type GuideStep = { title: string; text: string; example: string };

function stepsFor(user: SidebarUser): GuideStep[] {
  const username = String(user.username || user.name || "usuario").toLowerCase();
  if (username === "ana" || user.graphicRole === "GRAPHIC_SALES") return [
    { title: "Comece pelo CRM", text: "Abra Hoje para ver retornos. Use Leads para cadastrar ou editar contatos e Vendas da grafica para transformar interesse em proposta.", example: "Exemplo: abra o cliente Joao, registre Banner 1 x 1 m e clique em Criar orcamento." },
    { title: "Envie o catalogo", text: "Clique em Enviar catalogo, escolha o cliente e abra o WhatsApp. O cliente vera imagens, medidas, kits e precos.", example: "Exemplo: selecione o kit Banner 40 x 50 cm com 10 unidades." },
    { title: "Monte o orcamento", text: "Escolha Produto ou kit pronto para usar o preco exato do catalogo. Use Sob medida para calcular pela base da planilha em milimetros.", example: "Exemplo sob medida: 1000 x 1000 mm corresponde a 1 m2." },
    { title: "Libere o link", text: "Depois de gerar, agende o retorno e libere o link. O cliente pode abrir, baixar o PDF, aprovar e enviar a arte.", example: "Exemplo: retorno para amanha e envio do link pelo WhatsApp." },
    { title: "Acompanhe a jornada", text: "Quando o cliente aprovar, o pedido entra automaticamente na producao. Continue acompanhando pelo historico e pela jornada do cliente.", example: "Nao crie outro cadastro: use sempre o mesmo cliente e a mesma oportunidade." }
  ];
  if (username === "jorge" || user.graphicRole === "GRAPHIC_OPERATIONS") return [
    { title: "Veja a fila de producao", text: "Abra Producao e expedicao. Priorize pedidos liberados, atrasados ou com prazo mais proximo.", example: "Exemplo: abra o primeiro pedido com status Pronto para iniciar." },
    { title: "Confira a arte", text: "Antes de iniciar, confira produto, quantidade, medidas e arquivo enviado pelo cliente.", example: "Se faltar arte ou informacao, bloqueie com o motivo correto." },
    { title: "Use o cronometro", text: "Clique em Iniciar na etapa atual. O tempo corre ate Concluir; somente entao a proxima etapa e liberada.", example: "Iniciar Impressao, executar o trabalho e clicar em Concluir Impressao." },
    { title: "Registre problemas", text: "Use Bloquear para falta de material, falha de arquivo ou manutencao. Retome quando o impedimento estiver resolvido.", example: "O historico guarda quem iniciou, bloqueou, retomou e concluiu." },
    { title: "Finalize a expedicao", text: "Depois da ultima etapa, confira embalagem e dados de entrega antes de marcar como expedido ou entregue.", example: "O cliente acompanha essas mudancas pelo link publico." }
  ];
  return [
    { title: "Controle comercial", text: "CRM, clientes, oportunidades, catalogo e orcamentos formam uma unica jornada.", example: "Revise diariamente retornos atrasados e propostas aguardando o cliente." },
    { title: "Gerencie o catalogo", text: "Em Catalogo, edite imagens, visibilidade, kits, medidas, custos e precos. Produtos ocultos deixam de aparecer ao cliente.", example: "Revise primeiro as opcoes marcadas como custo calculado a partir do preco." },
    { title: "Acompanhe a operacao", text: "Produção usa etapas sequenciais, cronometro, bloqueios e expedicao. Cada acao fica registrada.", example: "Confira ordens sem responsavel e pedidos com prazo vencido." },
    { title: "Controle financeiro", text: "Pedidos aprovados geram titulos e alimentam o administrativo. Registre recebimentos e despesas no mesmo tenant.", example: "Compare valor vendido, custo previsto, recebido e saldo em aberto." },
    { title: "Mantenha os acessos", text: "Ana trabalha no CRM, Jorge na producao, Marina e Studium controlam o conjunto. Ajustes de papel devem preservar essa separacao.", example: "Use os usuarios reais; nao compartilhe a conta Studium na operacao diaria." }
  ];
}

export function RoleTutorial({ user }: { user: SidebarUser }) {
  const steps = useMemo(() => stepsFor(user), [user]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const storageKey = `merli360-role-guide-v2-${String(user.username || user.name).toLowerCase()}`;

  useEffect(() => {
    if (!localStorage.getItem(storageKey)) setOpen(true);
  }, [storageKey]);

  function finish() { localStorage.setItem(storageKey, "done"); setOpen(false); setStep(0); }
  function restart() { setStep(0); setOpen(true); }

  return <>
    <button className="fixed bottom-24 right-4 z-40 hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-xl md:inline-flex" type="button" onClick={restart}><BookOpen size={17} />Guia</button>
    {open ? <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/55 p-3 md:place-items-center" onMouseDown={finish}><section className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5"><div><p className="eyebrow">Guia de {user.name}</p><h2 className="text-xl font-black text-slate-950">{steps[step].title}</h2></div><button className="icon-action" type="button" title="Fechar guia" onClick={finish}><X size={18} /></button></div><div className="p-5"><div className="mb-5 flex gap-1">{steps.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-emerald-500" : "bg-slate-200"}`} />)}</div><p className="text-base font-semibold leading-7 text-slate-700">{steps[step].text}</p><div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-black uppercase text-emerald-700">Na pratica</p><p className="mt-1 text-sm font-bold text-emerald-950">{steps[step].example}</p></div></div><div className="flex items-center justify-between border-t border-slate-100 p-4"><button className="secondary-action inline-flex items-center gap-2 px-3 py-2" type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}><ChevronLeft size={16} />Voltar</button><span className="text-xs font-black text-slate-500">{step + 1} de {steps.length}</span>{step === steps.length - 1 ? <button className="primary-action inline-flex items-center gap-2 px-3 py-2" type="button" onClick={finish}><CheckCircle2 size={16} />Concluir</button> : <button className="primary-action inline-flex items-center gap-2 px-3 py-2" type="button" onClick={() => setStep((current) => current + 1)}>Proximo<ChevronRight size={16} /></button>}</div></section></div> : null}
  </>;
}
