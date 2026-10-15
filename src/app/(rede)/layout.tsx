import { RedeNav } from "@/components/insights/RedeNav";

// Public network analysis pages (the same views admins see, cached for a few minutes).
export default function RedeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <RedeNav />
      {children}
    </main>
  );
}
