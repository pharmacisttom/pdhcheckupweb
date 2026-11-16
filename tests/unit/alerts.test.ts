import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fire: vi.fn(),
  close: vi.fn(),
  isLoading: vi.fn(),
  isVisible: vi.fn(),
  getPopup: vi.fn(),
  showLoading: vi.fn(),
}));

vi.mock("sweetalert2", () => ({
  default: {
    fire: mocks.fire,
    close: mocks.close,
    isLoading: mocks.isLoading,
    isVisible: mocks.isVisible,
    getPopup: mocks.getPopup,
    showLoading: mocks.showLoading,
  },
}));

import {
  closeLoading,
  showConfirm,
  showError,
  showLoading,
  showSuccess,
  showWarning,
  showTextPrompt,
} from "../../src/lib/alerts";

describe("shared SweetAlert2 helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fire.mockResolvedValue({ isConfirmed: true, value: "เหตุผล" });
  });

  it("shows Thai success, error and warning messages as text", async () => {
    await showSuccess("บันทึกข้อมูลแล้ว");
    await showError("ไม่สามารถบันทึกข้อมูลได้");
    await showWarning("ตรวจสอบช่องที่ผิดพลาด");
    expect(mocks.fire).toHaveBeenCalledTimes(3);
    expect(mocks.fire.mock.calls.map(([options]) => options.text)).toEqual([
      "บันทึกข้อมูลแล้ว",
      "ไม่สามารถบันทึกข้อมูลได้",
      "ตรวจสอบช่องที่ผิดพลาด",
    ]);
    expect(mocks.fire.mock.calls[0][0]).toMatchObject({ toast: true });
    expect(mocks.fire.mock.calls[1][0]).toMatchObject({ icon: "error" });
    expect(mocks.fire.mock.calls[2][0]).toMatchObject({ icon: "warning" });
  });

  it("returns confirmation state and captures a reason as plain text", async () => {
    expect(await showConfirm("ดำเนินการต่อหรือไม่")).toBe(true);
    expect(mocks.fire.mock.calls[0][0]).toMatchObject({
      showCancelButton: true,
      focusCancel: true,
      reverseButtons: true,
    });
    await expect(
      showTextPrompt("เหตุผล", "ระบุเหตุผล"),
    ).resolves.toBe("เหตุผล");
    expect(mocks.fire.mock.calls[1][0]).toMatchObject({
      input: "textarea",
      inputLabel: "ระบุเหตุผล",
    });
  });

  it("opens a non-dismissible loading alert and closes a visible pending loader", () => {
    showLoading();
    const options = mocks.fire.mock.calls[0][0];
    expect(options).toMatchObject({
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
    });
    options.didOpen();
    expect(mocks.showLoading).toHaveBeenCalledOnce();
    mocks.isVisible.mockReturnValue(true);
    mocks.getPopup.mockReturnValue({ classList: { contains: (name: string) => name === "pdh-loading-popup" } });
    closeLoading();
    expect(mocks.close).toHaveBeenCalledOnce();
    mocks.getPopup.mockReturnValue({ classList: { contains: () => false } });
    closeLoading();
    expect(mocks.close).toHaveBeenCalledOnce();
    mocks.isVisible.mockReturnValue(false);
    closeLoading();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
