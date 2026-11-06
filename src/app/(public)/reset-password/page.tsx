export const metadata = { robots: { index: false, follow: false } };
import { StaffRecovery } from "@/components/staff-recovery";
export default function Page() {
  return <StaffRecovery mode="reset" />;
}
