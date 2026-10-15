import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Admin · Minha Bolha",
  robots: { index: false, follow: false },
};

// Admin only (see lib/admin). Each page checks again: layouts don't re-run on client navigation.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
      {children}
    </main>
  );
}

async function Gate() {
  await requireAdmin();
  return <AdminNav />;
}
