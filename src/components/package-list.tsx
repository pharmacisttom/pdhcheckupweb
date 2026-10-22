"use client";
import { useQuery } from '@tanstack/react-query';
import { request, type PublicPackage } from "@/lib/client";
import { EmptyState, ErrorState, Loading, PackageCard } from "./ui";
export function PackageList() {
  const { data: items, error, isPending } = useQuery({ queryKey: ['public-packages'], queryFn: () => request<PublicPackage[]>('packages') });
  if (error) return <ErrorState message={error.message} />;
  if (isPending || !items) return <Loading />;
  return items.length ? (
    <div className="package-grid">
      {items.map((p) => (
        <PackageCard key={p.id} item={p} />
      ))}
    </div>
  ) : (
    <EmptyState>
      ยังไม่มีแพ็กเกจที่ได้รับอนุมัติและเปิดให้จอง
      กรุณาติดต่อเจ้าหน้าที่โรงพยาบาล
    </EmptyState>
  );
}
