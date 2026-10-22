"use client";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  HeartPulse,
  LoaderCircle,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand" href="/">
      <span className="brand-icon">
        <HeartPulse size={26} />
      </span>
      <span>
        <b>
          PDH <span>Smart Health</span>
        </b>
        {!compact && <small>โรงพยาบาลปลวกแดง</small>}
      </span>
    </a>
  );
}
export function EmptyState({
  children = "ยังไม่มีข้อมูลในระบบ",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <HeartPulse size={36} />
      <h3>พร้อมเมื่อคุณพร้อม</h3>
      <p>{children}</p>
    </div>
  );
}
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="alert error" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> กำลังโหลดข้อมูล…
    </div>
  );
}
export const statusNames: Record<string, string> = {
  confirmed: "ยืนยันนัด",
  checked_in: "เช็กอินแล้ว",
  in_service: "กำลังรับบริการ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
  no_show: "ไม่มาตามนัด",
  draft: "ฉบับร่าง",
  published: "เผยแพร่แล้ว",
  archived: "เก็บถาวร",
  staged: "รออนุมัติ",
  invalid: "พบข้อผิดพลาด",
  estimate: "ประมาณการ",
  pending_identity_review: "รอตรวจสอบตัวตน",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={"badge status-" + status}>
      <span aria-hidden>●</span> {statusNames[status] ?? status}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Modal({
  label,
  title,
  children,
}: {
  label: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="button ghost">
          {label}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>
            รายละเอียดเพื่อประกอบการตัดสินใจ
          </Dialog.Description>
          {children}
          <Dialog.Close type="button" className="button">
            ปิด
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function PackageCard({
  item,
  selected,
  onSelect,
}: {
  item: import("@/lib/client").PublicPackage;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <article className={"package-card " + (selected ? "selected" : "")}>
      <div className="package-symbol">
        <HeartPulse />
      </div>
      <div className="eyebrow">HEALTH CHECK • V{item.version}</div>
      <h3>{item.name}</h3>
      <p>{item.description}</p>
      <div className="package-price">
        {new Intl.NumberFormat("th-TH").format(Number(item.price))}
        <small> บาท / ท่าน</small>
      </div>
      <div className="divider" />
      <p className="muted">
        {item.audience} · อายุ {item.minAge}–{item.maxAge} ปี
      </p>
      <ul className="check-list">
        {item.items.slice(0, 4).map((i) => (
          <li key={i.id}>
            <Check size={16} />
            {i.nameTh}
          </li>
        ))}
      </ul>
      <Modal
        label={"ดูรายการทั้งหมด (" + item.items.length + ")"}
        title={item.name}
      >
        <ul>
          {item.items.map((i) => (
            <li key={i.id}>{i.nameTh}</li>
          ))}
        </ul>
        <p>{item.preparation}</p>
      </Modal>
      {onSelect ? (
        <button
          type="button"
          className={"button " + (selected ? "" : "secondary")}
          onClick={onSelect}
        >
          {selected ? (
            <>
              <Check size={16} />
              เลือกแล้ว
            </>
          ) : (
            <>
              เลือกแพ็กเกจ
              <ArrowRight size={16} />
            </>
          )}
        </button>
      ) : (
        <a className="button secondary" href={"/register?package=" + item.id}>
          เลือกแพ็กเกจนี้ <ArrowRight size={16} />
        </a>
      )}
    </article>
  );
}
