import type { Metadata } from "next";
import "./globals.css";
import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";
import { getCurrentUser } from "@/lib/auth";
import { getGraphicRole, hasGraphicAccess } from "@/lib/graphic";

export const metadata: Metadata = {
  title: "Merli360",
  description: "Gestao financeira, comercial e estrategica",
  manifest: "/manifest.webmanifest",
  icons: [{ rel: "icon", url: "/icon.svg" }]
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const graphicRole = user && hasGraphicAccess(user) ? await getGraphicRole(user) : undefined;

  return (
    <html lang="pt-BR">
      <body>
        {user ? (
          <AuthenticatedAppShell user={{ ...user, graphicRole }}>{children}</AuthenticatedAppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
