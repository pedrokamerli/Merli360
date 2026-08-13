import { AiSettingsPanel } from "@/components/AiSettingsPanel";
import { UserAccountSettings } from "@/components/UserAccountSettings";
import { UserAiProfileSettings } from "@/components/UserAiProfileSettings";
import { requireUser } from "@/lib/auth";
import { CrmSettingsPanel } from "@/components/CrmSettingsPanel";
import { hasModuleAccess } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <p className="eyebrow">Configuracoes</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">Configuracoes do SaaS</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">Ajustes da sua conta, IA, memoria, objetivos e comportamento do sistema.</p>
      </header>
      {hasModuleAccess(user, "financeiro") ? <><UserAccountSettings /><UserAiProfileSettings />{user.role === "superadmin" ? <AiSettingsPanel /> : null}</> : null}
      {hasModuleAccess(user, "crm") ? <CrmSettingsPanel /> : null}
    </div>
  );
}
