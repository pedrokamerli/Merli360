import { EntityManager } from "@/components/EntityManager";
import { WalletCards } from "@/components/WalletCards";
import { modelConfigs } from "@/lib/models";
import { getWalletBalances } from "@/lib/wallets";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const user = await requireUser();
  const wallets = await getWalletBalances(user.tenantId);

  return (
    <div className="space-y-5">
      <WalletCards wallets={wallets} />
      <EntityManager config={modelConfigs.transactions} />
    </div>
  );
}
