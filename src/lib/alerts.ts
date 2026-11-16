"use client";

import Swal, { type SweetAlertIcon } from "sweetalert2";

const defaults = {
  confirmButtonText: "ตกลง",
  cancelButtonText: "ยกเลิก",
  heightAuto: false,
  buttonsStyling: true,
  customClass: { popup: "pdh-alert-popup" },
};

function show(icon: SweetAlertIcon, title: string, text: string) {
  return Swal.fire({
    ...defaults,
    icon,
    title,
    text,
    confirmButtonText: "ตกลง",
    focusConfirm: true,
    allowEscapeKey: true,
  });
}

export async function showSuccess(message: string, title = "สำเร็จ") {
  await Swal.fire({
    ...defaults,
    icon: "success",
    title,
    text: message,
    toast: true,
    position: "top",
    showConfirmButton: false,
    timer: 1800,
    timerProgressBar: true,
    didOpen: (element) => element.setAttribute("aria-live", "polite"),
  });
}

export async function showError(
  message = "ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง",
  title = "เกิดข้อผิดพลาด",
) {
  await show("error", title, message);
}

export async function showWarning(
  message: string,
  title = "โปรดตรวจสอบข้อมูล",
) {
  await show("warning", title, message);
}

export async function showConfirm(
  message: string,
  title = "ยืนยันการดำเนินการ",
  confirmText = "ยืนยัน",
) {
  const result = await Swal.fire({
    ...defaults,
    icon: "question",
    title,
    text: message,
    showCancelButton: true,
    confirmButtonText: confirmText,
    focusCancel: true,
    reverseButtons: true,
    allowEscapeKey: true,
  });
  return result.isConfirmed;
}

export async function showTextPrompt(
  title: string,
  label: string,
  confirmText = "ยืนยัน",
): Promise<string | null> {
  const result = await Swal.fire({
    ...defaults,
    title,
    input: "textarea",
    inputLabel: label,
    inputAttributes: { "aria-label": label, maxlength: "500" },
    inputValidator: (value) =>
      value?.trim() ? undefined : "กรุณาระบุเหตุผล",
    showCancelButton: true,
    confirmButtonText: confirmText,
    focusCancel: true,
    reverseButtons: true,
  });
  return result.isConfirmed && typeof result.value === "string"
    ? result.value.trim()
    : null;
}

export function showLoading(title = "กำลังบันทึกข้อมูล") {
  void Swal.fire({
    ...defaults,
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
}

export function closeLoading() {
  if (Swal.isLoading()) Swal.close();
}
