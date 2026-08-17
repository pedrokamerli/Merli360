"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeDollarSign,
  Banknote,
  BarChart3,
  FileSpreadsheet,
  Home,
  ScrollText,
  Tags,
  Upload,
  Users,
  Wheat,
  Package,
  Sprout,
  CalendarDays,
  ShoppingBasket,
  LogOut,
  Bell,
  BrainCircuit,
  CircleAlert,
  Paperclip,
  Menu,
  X,
  Settings,
  Printer
} from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";

export type SidebarUser = {
  name: string;
  username?: string;
  role: string;
  tenant: {
    brandName: string;
    kind: string;
  };
  moduleAccess?: string;
  graphicRole?: "GRAPHIC_SALES" | "GRAPHIC_ADMIN" | "GRAPHIC_OPERATIONS" | "GRAPHIC_OWNER" | "GRAPHIC_ADVISOR";
};

const consultoriaItems = [
  { href: "/", label: "Visao geral", icon: Home },
  { href: "/fluxo", label: "Movimentacoes", icon: Banknote },
  { href: "/receber", label: "Contas a Receber", icon: BadgeDollarSign },
  { href: "/pagar", label: "Contas a Pagar", icon: ScrollText },
  { href: "/titulos", label: "Titulos Financeiros", icon: ScrollText },
  { href: "/contas-financeiras", label: "Contas Financeiras", icon: Banknote },
  { href: "/transferencias", label: "Transferencias", icon: Banknote },
  { href: "/conciliacao", label: "Conciliacao", icon: FileSpreadsheet },
  { href: "/pendencias", label: "Pendencias", icon: CircleAlert },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/ia", label: "IA Assistente", icon: BrainCircuit },
  { href: "/categorias", label: "Categorias e Centros", icon: Tags },
  { href: "/orcamento", label: "Orcamento", icon: BarChart3 },
  { href: "/notificacoes", label: "Notificacoes", icon: Bell },
  { href: "/comprovantes", label: "Comprovantes", icon: Paperclip },
  { href: "/importar", label: "Importar Extrato", icon: Upload },
  { href: "/questionarios", label: "Questionarios", icon: FileSpreadsheet },
  { href: "/configuracoes", label: "Configuracoes", icon: Settings },
  { href: "/relatorios", label: "Relatorios", icon: BarChart3 }
];

const crmItems = [
  { href: "/crm", label: "CRM Comercial", icon: Users },
  { href: "/configuracoes", label: "Configuracoes CRM", icon: Settings }
];

function graphicItemsFor(role?: SidebarUser["graphicRole"]) {
  if (!role) return [{ href: "/gestao-grafica", label: "Gestao da Grafica", icon: Printer }];
  if (role === "GRAPHIC_SALES") return [{ href: "/crm", label: "CRM", icon: Users }];
  if (role === "GRAPHIC_ADMIN") return [
    { href: "/gestao-grafica/administrativo", label: "Administrativo", icon: Banknote },
    { href: "/gestao-grafica/gestao", label: "Gestao", icon: BarChart3 }
  ];
  if (role === "GRAPHIC_OPERATIONS") return [
    { href: "/gestao-grafica/operacao", label: "Producao", icon: Package },
    { href: "/gestao-grafica/minhas-vendas", label: "Minhas Vendas", icon: Printer }
  ];
  if (role === "GRAPHIC_ADVISOR") return [{ href: "/gestao-grafica/gestao", label: "Gestao", icon: BarChart3 }];
  return [
    { href: "/crm", label: "CRM", icon: Users },
    { href: "/gestao-grafica/operacao", label: "Producao", icon: Package },
    { href: "/gestao-grafica/administrativo", label: "Administrativo", icon: Banknote },
    { href: "/gestao-grafica/gestao", label: "Gestao", icon: BarChart3 },
    { href: "/gestao-grafica/configuracoes", label: "Cadastros", icon: Settings }
  ];
}

const agroItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/fluxo", label: "Fluxo de Caixa", icon: Banknote },
  { href: "/vendas", label: "Vendas", icon: ShoppingBasket },
  { href: "/compradores", label: "Compradores", icon: Users },
  { href: "/receber", label: "Contas a Receber", icon: BadgeDollarSign },
  { href: "/pagar", label: "Contas a Pagar", icon: ScrollText },
  { href: "/transferencias", label: "Transferencias", icon: Banknote },
  { href: "/conciliacao", label: "Conciliacao", icon: FileSpreadsheet },
  { href: "/pendencias", label: "Pendencias", icon: CircleAlert },
  { href: "/produtos", label: "Culturas/Produtos", icon: Wheat },
  { href: "/plantios", label: "Plantios", icon: Sprout },
  { href: "/colheitas", label: "Colheitas", icon: Package },
  { href: "/estoque", label: "Estoque", icon: Package },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/ia", label: "IA Assistente", icon: BrainCircuit },
  { href: "/categorias", label: "Categorias", icon: Tags },
  { href: "/notificacoes", label: "Notificacoes", icon: Bell },
  { href: "/comprovantes", label: "Comprovantes", icon: Paperclip },
  { href: "/configuracoes", label: "Configuracoes", icon: Settings },
  { href: "/relatorios", label: "Relatorios", icon: BarChart3 }
];

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAgro = user.tenant.kind === "agro";
  const onlyCrm = user.role !== "superadmin" && user.moduleAccess !== "all" && Boolean(user.moduleAccess?.includes("crm"));
  const items = [
    ...(onlyCrm ? crmItems : [...(isAgro ? agroItems : consultoriaItems), { href: "/crm", label: "CRM Comercial", icon: Users }]),
    ...graphicItemsFor(user.graphicRole),
    ...(user.role === "superadmin" ? [
      { href: "/usuarios", label: "Usuarios SaaS", icon: Users }
    ] : [])
  ].filter((item, index, rows) => rows.findIndex((candidate) => candidate.href === item.href) === index);
  const mobileItems = (onlyCrm ? ["/crm", "/configuracoes"] : isAgro ? ["/", "/fluxo", "/vendas", "/receber"] : ["/", "/fluxo", "/receber", "/pagar"])
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is (typeof items)[number] => Boolean(item));

  return (
    <>
      <aside className="app-sidebar">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="brand-mark">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{user.tenant.brandName}</h1>
            <p className="text-xs font-medium text-slate-400">{isAgro ? "Gestao rural" : "by Pedro Merli"}</p>
          </div>
        </div>
        <nav className="app-nav">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={clsx("nav-link", active && "nav-link-active")}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="app-sidebar-note">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-violet-600" />
          <div>
            <p className="font-semibold text-white">{user.name}</p>
            <p className="text-xs text-slate-400">{user.role === "superadmin" ? "Super usuario" : user.role === "admin" ? "Administrador" : "Usuario"}</p>
          </div>
          <form action="/api/logout" method="post" className="ml-auto">
            <button className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-slate-300 hover:bg-white/10" title="Sair">
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <section className="mobile-menu-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">{user.tenant.brandName}</p>
                <h2 className="text-xl font-black text-slate-950">Menu</h2>
              </div>
              <button className="icon-action" onClick={() => setMobileMenuOpen(false)} type="button" title="Fechar menu">
                <X size={18} />
              </button>
            </div>
            <div className="mobile-menu-grid">
              {items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={clsx("mobile-menu-item", active && "mobile-menu-item-active")}
                  >
                    <span className="mobile-menu-icon">
                      <Icon size={19} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      <nav className="mobile-bottom-nav" aria-label="Menu principal mobile">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={clsx("mobile-nav-link", active && "text-violet-600")}>
              <Icon size={20} />
              <span>{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
        <button className={clsx("mobile-nav-link", mobileMenuOpen && "text-violet-600")} onClick={() => setMobileMenuOpen(true)} type="button">
          <Menu size={20} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
}
