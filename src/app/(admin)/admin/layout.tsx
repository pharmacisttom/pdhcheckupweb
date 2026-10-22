import { redirect } from "next/navigation";
import { session } from "@/lib/security";
import { AdminShell } from "@/components/admin-shell";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await session(false).catch(() => null);
  if (!s?.user) redirect("/login");
  return (
    <AdminShell
      name={s.user.name}
      role={s.user.role}
      demo={process.env.NODE_ENV !== "production"}
    >
      {children}
    </AdminShell>
  );
}
