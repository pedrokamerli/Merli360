import { TransfersWorkspace } from "@/components/TransfersWorkspace";
import { getWalletBalances } from "@/lib/wallets";
import { WalletCards } from "@/components/WalletCards";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const wallets = await getWalletBalances(user.tenantId);

  return (
    <div className="space-y-6">
      <WalletCards wallets={wallets} />
      <TransfersWorkspace />
    </div>
  );
}
