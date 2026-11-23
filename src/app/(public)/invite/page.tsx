export const metadata = { robots: { index: false, follow: false } };
import { EnrollmentForm } from "@/components/staff-enrollment";
export default function Page() {
  return <EnrollmentForm mode="activate" />;
}
