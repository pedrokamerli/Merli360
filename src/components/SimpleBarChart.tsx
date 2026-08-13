"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";

export function SimpleBarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  return (
    <div className="surface-panel h-80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950">Fluxo de Caixa</h2>
          <p className="text-xs font-semibold text-slate-500">Receitas, despesas e saldo do periodo</p>
        </div>
        <span className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600">Mensal</span>
      </div>
      <ResponsiveContainer width="100%" height="78%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(value) => money.format(Number(value)).replace("R$", "")} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => money.format(Number(value))} cursor={{ fill: "rgba(79,70,229,0.08)" }} />
          <Bar dataKey="value" fill="#4f46e5" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
