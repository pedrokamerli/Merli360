import { FirstAccessSetupForm } from "@/components/FirstAccessSetupForm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FirstAccessPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-4xl p-4 pb-28 md:py-8">
      <FirstAccessSetupForm
        user={{
          name: user.name,
          username: user.username,
          mustChangePassword: user.mustChangePassword,
          tenant: {
            brandName: user.tenant.brandName,
            kind: user.tenant.kind
          }
        }}
      />
    </main>
  );
}
