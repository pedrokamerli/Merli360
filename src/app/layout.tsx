import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { PwaBoot } from "@/components/PwaBoot";
import { OnboardingTour } from "@/components/OnboardingTour";
import { GlobalAssistantButton } from "@/components/GlobalAssistantButton";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Merli360",
  description: "Gestao financeira, comercial e estrategica",
  manifest: "/manifest.webmanifest",
  icons: [{ rel: "icon", url: "/icon.svg" }]
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="pt-BR">
      <body>
        {user ? (
          <div className="app-shell min-h-screen">
            <PwaBoot />
            <Sidebar user={user} />
            <OnboardingTour brandName={user.tenant.brandName} tenantKind={user.tenant.kind} userName={user.username} />
            <main className="min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
            <GlobalAssistantButton />
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
