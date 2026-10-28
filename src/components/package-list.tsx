"use client";
import { useLanguage } from "@/components/language-provider";
import { useQuery } from "@tanstack/react-query";
import { request, type PublicPackage } from "@/lib/client";
import { EmptyState, ErrorState, PackageCard } from "./ui";
export function PackageList() {
  const { t } = useLanguage();

  const {
    data: items,
    error,
    isPending,
  } = useQuery({
    queryKey: ["public-packages"],
    queryFn: () => request<PublicPackage[]>("packages"),
  });
  if (error) return <ErrorState message={error.message} />;
  if (isPending || !items)
    return (
      <div role="status" aria-label={t("กำลังโหลดแพ็กเกจตรวจสุขภาพ")}>
        <span className="sr-only">{t("กำลังโหลดแพ็กเกจตรวจสุขภาพ")}</span>
        <div className="package-grid" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="package-card package-skeleton">
              <div />
              <div />
              <div />
            </div>
          ))}
        </div>
      </div>
    );
  return items.length ? (
    <div className="package-grid">
      {items.map((p) => (
        <PackageCard key={p.id} item={p} />
      ))}
    </div>
  ) : (
    <EmptyState>
      {t(
        "ยังไม่มีแพ็กเกจที่ได้รับอนุมัติและเปิดให้จอง กรุณาติดต่อเจ้าหน้าที่โรงพยาบาล",
      )}
    </EmptyState>
  );
}
