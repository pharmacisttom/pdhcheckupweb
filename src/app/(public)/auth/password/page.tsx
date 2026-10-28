import { EnrollmentForm } from '@/components/staff-enrollment';
import { onboardingIdentity, onboardingNext } from '@/server/services/enrollment';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const identity = await onboardingIdentity().catch(() => null);
  if (!identity) redirect('/login');
  if (identity.stage !== 'password' || !identity.user.mustChangePassword) redirect(onboardingNext(identity.user));
  return <EnrollmentForm mode="password" />;
}
