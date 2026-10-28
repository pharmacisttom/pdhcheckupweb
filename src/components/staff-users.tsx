"use client";
import { ResponsiveTable } from "./responsive-table";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/client";
import { staffRoles } from "@/lib/staff-roles";
import { ErrorState, Loading, PageHeader } from "./ui";
type Staff = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  activationRequired: boolean;
  mustChangePassword: boolean;
  mfaEnrolled: boolean;
  activeSessions: number;
  invitationExpiresAt: string | null;
};
type Result = { users: Staff[]; total: number; page: number };
type MutationResult = {
  reauthenticate?: boolean;
  invitation?: { activationUrl: string; expiresAt: string } | null;
};
export function StaffUsers({ role }: { role: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState("invitation");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState<MutationResult["invitation"]>(null);
  const list = useQuery({
    queryKey: ["staff-users", search, page],
    queryFn: () =>
      request<Result>(
        "admin/users?q=" + encodeURIComponent(search) + "&page=" + page,
      ),
  });
  const roles = staffRoles.filter(
    (r) => role === "superadmin" || r !== "superadmin",
  );
  async function submit(
    form: HTMLFormElement,
    path: string,
    data: Record<string, unknown>,
  ) {
    const values = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    setInvite(null);
    try {
      const result = await request<MutationResult>(path, {
        ...data,
        verification: {
          password: values.get("adminPassword"),
          mfa: values.get("adminMfa"),
        },
      });
      if (result.reauthenticate) {
        router.replace("/login");
        router.refresh();
        return;
      }
      setInvite(result.invitation);
      setSelected(null);
      setCreating(false);
      setNotice("บันทึกแล้ว เซสชันเดิมของบัญชีที่แก้ไขถูกเพิกถอน");
      await queryClient.invalidateQueries({ queryKey: ["staff-users"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      for (const name of ["adminPassword", "adminMfa", "temporaryPassword"]) {
        const input = form.elements.namedItem(name) as HTMLInputElement | null;
        if (input) input.value = "";
      }
      setBusy(false);
    }
  }
  const proof = (
    <>
      <label className="field">
        รหัสผ่านของผู้ดูแล
        <input
          type="password"
          name="adminPassword"
          autoComplete="current-password"
          maxLength={128}
          required
          disabled={busy}
        />
      </label>
      <label className="field">
        MFA ของผู้ดูแล
        <input
          name="adminMfa"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          required
          disabled={busy}
        />
      </label>
    </>
  );
  return (
    <>
      <PageHeader
        title="จัดการผู้ใช้งาน"
        description="จัดการบัญชีเจ้าหน้าที่ สิทธิ์ การเปิดใช้งาน และ MFA"
      >
        <button
          className="button"
          disabled={busy}
          onClick={() => {
            setCreating(true);
            setSelected(null);
            setError("");
            setInvite(null);
          }}
        >
          สร้างบัญชีเจ้าหน้าที่
        </button>
      </PageHeader>
      {error && <ErrorState message={error} />}
      {notice && <p role="status">{notice}</p>}
      {invite && (
        <section className="card invitation-result">
          <h2>คำเชิญเปิดใช้งานบัญชี</h2>
          <p>
            แสดงลิงก์นี้ครั้งเดียว
            ส่งให้เจ้าของบัญชีผ่านช่องทางที่โรงพยาบาลอนุมัติ
            ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง
          </p>
          <label className="field">
            ลิงก์คำเชิญ
            <input
              readOnly
              value={invite.activationUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <button className="button secondary" onClick={() => setInvite(null)}>
            ซ่อนลิงก์คำเชิญ
          </button>
        </section>
      )}
      {(creating || selected) && (
        <section className="card staff-editor">
          <h2>
            {creating ? "สร้างบัญชีใหม่" : "แก้ไขบัญชี " + selected?.email}
          </h2>
          <form
            key={selected?.id ?? "new"}
            className="form-grid"
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              void submit(
                e.currentTarget,
                creating ? "admin/users" : "admin/users/update",
                {
                  ...(selected
                    ? {
                        id: selected.id,
                        active: values.get("active") === "on",
                        forcePasswordChange:
                          values.get("forcePasswordChange") === "on",
                      }
                    : {}),
                  name: values.get("name"),
                  email: values.get("email"),
                  role: values.get("role"),
                  ...(creating && mode === "temporary"
                    ? { temporaryPassword: values.get("temporaryPassword") }
                    : {}),
                },
              );
            }}
          >
            <label className="field">
              ชื่อเจ้าหน้าที่
              <input
                name="name"
                defaultValue={selected?.name}
                maxLength={160}
                required
                disabled={busy}
              />
            </label>
            <label className="field">
              อีเมลเจ้าหน้าที่
              <input
                name="email"
                type="email"
                defaultValue={selected?.email}
                maxLength={191}
                required
                disabled={busy}
              />
            </label>
            <label className="field">
              บทบาท
              <select
                name="role"
                defaultValue={selected?.role ?? "registration"}
                disabled={busy}
              >
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            {creating ? (
              <>
                <label className="field">
                  วิธีเริ่มใช้งาน
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    disabled={busy}
                  >
                    <option value="invitation">
                      คำเชิญตั้งรหัสผ่านด้วยตนเอง
                    </option>
                    <option value="temporary">
                      รหัสผ่านชั่วคราว ต้องเปลี่ยนครั้งแรก
                    </option>
                  </select>
                </label>
                {mode === "temporary" && (
                  <label className="field">
                    รหัสผ่านชั่วคราว
                    <input
                      name="temporaryPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={14}
                      maxLength={128}
                      required
                      disabled={busy}
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <label className="check-label">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={selected?.active}
                    disabled={busy}
                  />
                  เปิดใช้งานบัญชี
                </label>
                <label className="check-label">
                  <input
                    name="forcePasswordChange"
                    type="checkbox"
                    disabled={busy}
                  />
                  บังคับเปลี่ยนรหัสผ่านในการเข้าสู่ระบบครั้งถัดไป
                </label>
              </>
            )}
            {proof}
            <div className="form-actions">
              <button className="button" disabled={busy}>
                บันทึกบัญชี
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setCreating(false);
                  setSelected(null);
                }}
              >
                ยกเลิก
              </button>
            </div>
          </form>
          {selected && (
            <form
              className="form-grid"
              method="post"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const action = String(f.get("action"));
                if (
                  !window.confirm(
                    "ยืนยันดำเนินการกับบัญชีนี้? เซสชันเดิมจะถูกเพิกถอน",
                  )
                )
                  return;
                void submit(e.currentTarget, "admin/users/action", {
                  id: selected.id,
                  action,
                  reason: f.get("reason"),
                });
              }}
            >
              <h3>จัดการความปลอดภัยของบัญชี</h3>
              <label className="field">
                การดำเนินการ
                <select name="action" disabled={busy}>
                  <option value="revoke-sessions">เพิกถอนเซสชันทั้งหมด</option>
                  <option value="reset-mfa">
                    รีเซ็ต MFA และบังคับเปลี่ยนรหัสผ่าน
                  </option>
                  {selected.activationRequired && (
                    <option value="invite">ออกคำเชิญใหม่</option>
                  )}
                </select>
              </label>
              <label className="field">
                เหตุผล (ไม่ใส่รหัสผ่านหรือคีย์)
                <input
                  name="reason"
                  minLength={8}
                  maxLength={500}
                  required
                  disabled={busy}
                />
              </label>
              {proof}
              <button className="button secondary" disabled={busy}>
                ยืนยันการดำเนินการ
              </button>
            </form>
          )}
        </section>
      )}
      <section className="card">
        <form
          className="form-actions"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(
              String(new FormData(e.currentTarget).get("search") ?? ""),
            );
            setPage(1);
          }}
        >
          <label className="field">
            ค้นหาชื่อหรืออีเมล
            <input name="search" maxLength={100} />
          </label>
          <button className="button secondary">ค้นหา</button>
        </form>
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error.message} />
        ) : (
          <>
            <div className="table-wrap">
              <ResponsiveTable>
                <thead>
                  <tr>
                    <th>เจ้าหน้าที่</th>
                    <th>บทบาท</th>
                    <th>สถานะบัญชี</th>
                    <th>MFA</th>
                    <th>เซสชันที่ยังไม่หมดอายุ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                        <br />
                        {user.email}
                      </td>
                      <td>{user.role}</td>
                      <td>
                        {!user.active
                          ? "ระงับบัญชี"
                          : user.activationRequired
                            ? "รอเปิดใช้งาน"
                            : user.mustChangePassword
                              ? "ต้องเปลี่ยนรหัสผ่าน"
                              : "เปิดใช้งาน"}
                        {user.invitationExpiresAt && (
                          <small>
                            {" "}
                            คำเชิญถึง{" "}
                            {new Date(user.invitationExpiresAt).toLocaleString(
                              "th-TH",
                            )}
                          </small>
                        )}
                      </td>
                      <td>
                        {user.mfaEnrolled ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}
                      </td>
                      <td>{user.activeSessions}</td>
                      <td>
                        <button
                          className="button small secondary"
                          aria-label={"จัดการ " + user.email}
                          disabled={
                            busy ||
                            (user.role === "superadmin" &&
                              role !== "superadmin")
                          }
                          onClick={() => {
                            setSelected(user);
                            setCreating(false);
                            setInvite(null);
                            setError("");
                          }}
                        >
                          จัดการบัญชี
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
            {!list.data.users.length && <p>ไม่พบบัญชี</p>}
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ก่อนหน้า
              </button>
              <span>
                หน้า {page} · {list.data.total} บัญชี
              </span>
              <button
                className="button secondary"
                disabled={page * 25 >= list.data.total}
                onClick={() => setPage(page + 1)}
              >
                ถัดไป
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
