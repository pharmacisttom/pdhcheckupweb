import { ManagedRecords } from "@/components/managed-records";
import { notFound } from "next/navigation";
import { ChangePassword } from "@/components/change-password";
import { AdminWorkspace } from "@/components/admin-workspace";
import { ConfigurationWorkspace } from "@/components/configuration-workspace";
import { BookingControl, ContactRequests } from "@/components/booking-control";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "organizations")
    return <ManagedRecords kind="organizations" />;
  if (section === "billing" || section === "quotations")
    return <ManagedRecords kind="finance" />;
  if (section === "privacy") return <ManagedRecords kind="privacy" />;
  if (section === "change-password") return <ChangePassword />;
  if (section === "booking-control") return <BookingControl />;
  if (section === "contact-requests") return <ContactRequests />;
  if (
    section === "questionnaires" ||
    section === "calendar" ||
    section === "waitlist"
  )
    return <ConfigurationWorkspace section={section} />;
  if (
    ![
      "appointments",
      "packages",
      "lab-pricing",
      "organizations",
      "quotations",
      "billing",
      "reports",
      "audit",
      "privacy",
    ].includes(section)
  )
    notFound();
  return <AdminWorkspace section={section} />;
}
