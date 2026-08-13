"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Imprimir / salvar PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary print:hidden">
      <Printer size={16} />
      {label}
    </button>
  );
}
