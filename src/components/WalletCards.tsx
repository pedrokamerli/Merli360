import { Wallet } from "lucide-react";
import { WalletBalance } from "@/lib/wallets";
import { money } from "@/lib/format";

export function WalletCards({ wallets }: { wallets: WalletBalance[] }) {
  const total = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);

  return (
    <section className="surface-panel p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Carteiras</p>
          <h2 className="text-lg font-black text-slate-950">Saldos por conta</h2>
        </div>
        <div className="rounded-2xl bg-violet-50 px-4 py-2 text-left md:text-right">
          <p className="text-xs font-bold uppercase text-violet-600">Total confirmado</p>
          <p className="text-lg font-black text-violet-700">{money.format(total)}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {wallets.map((wallet) => (
          <div key={wallet.account} className="wallet-mini-card">
            <div className="flex items-center justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-violet-600">
                <Wallet size={18} />
              </div>
              <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-bold text-slate-500">{wallet.account}</span>
            </div>
            <p className="mt-4 break-words text-2xl font-black tracking-tight text-slate-950">{money.format(wallet.balance)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
              <span className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-700">+ {money.format(wallet.inputs)}</span>
              <span className="rounded-xl bg-red-50 px-2 py-2 text-red-600">- {money.format(wallet.outputs)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
