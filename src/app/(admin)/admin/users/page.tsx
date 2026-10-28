import { StaffUsers } from "@/components/staff-users";
import { permitted, session, identitySession } from "@/lib/security";
import { onboardingNext } from "@/server/services/enrollment";
import { notFound, redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const identity = await session(false);
  if (!identity?.user) {
    const pending = await identitySession(false);
    if (pending?.user && pending.stage !== "full")
      redirect(onboardingNext(pending.user));
    redirect("/login");
  }
  if (!permitted(identity.user.role, "users:manage")) notFound();
  return <StaffUsers role={identity.user.role} />;
}
