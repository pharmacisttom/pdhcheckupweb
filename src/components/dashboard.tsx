"use client";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Coins,
  Download,
  Plus,
  UserCheck,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { request, money, dateTime } from "@/lib/client";
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  StatusBadge,
  statusNames,
} from "./ui";
type DashboardData = {
  from: string;
  to: string;
  total: number;
  checkedIn: number;
  completed: number;
  cancelled: number;
  noShow: number;
  estimated: string;
  statuses: { name: string; value: number }[];
  trend: { date: string; count: number }[];
  bookings: {
    id: string;
    reference: string;
    startsAt: string;
    status: string;
    total: string;
    packageName: string;
  }[];
};
function localDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(),
  );
}
export function Dashboard() {
  const [from, setFrom] = useState(localDay);
  const [to, setTo] = useState(localDay);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load(start: string, end: string) {
    setLoading(true);
    setError("");
    try {
      setData(
        await request<DashboardData>(
          "admin/dashboard?from=" + start + "&to=" + end,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const d = localDay();
    load(d, d);
  }, []);
  const metrics = data
    ? [
        {
          label: "นัดหมายในช่วงวันที่",
          value: data.total.toLocaleString("th-TH"),
          hint: "จำนวนตามวันนัดหมาย",
          icon: ClipboardList,
        },
        {
          label: "นัดที่ยังรอเข้ารับบริการ",
          value: data.bookings
            .filter((b) => b.status === "confirmed")
            .length.toLocaleString("th-TH"),
          hint: "นับเฉพาะสถานะยืนยันนัด",
          icon: CalendarDays,
        },
        {
          label: "มูลค่านัดหมายประมาณการ",
          value: money(data.estimated),
          hint: "ไม่ใช่รายได้ที่รับชำระแล้ว",
          icon: Coins,
        },
        {
          label: "ผู้เช็กอินแล้ว",
          value: data.checkedIn.toLocaleString("th-TH"),
          hint: "มีเวลาบันทึกการมาถึง",
          icon: UserCheck,
        },
        {
          label: "ตรวจเสร็จสิ้น",
          value: data.completed.toLocaleString("th-TH"),
          hint: "สถานะเสร็จสิ้น",
          icon: CheckCircle2,
        },
        {
          label: "ยกเลิก / ไม่มาตามนัด",
          value: data.total
            ? (((data.cancelled + data.noShow) / data.total) * 100).toFixed(1) +
              "%"
            : "—",
          hint: data.cancelled + " ยกเลิก · " + data.noShow + " ไม่มาตามนัด",
          icon: XCircle,
        },
      ]
    : [];
  return (
    <>
      <PageHeader
        eyebrow="HEALTH CHECK OVERVIEW"
        title="ภาพรวมระบบตรวจสุขภาพ"
        description="ข้อมูลการนัดหมายและการให้บริการ เพื่อวางแผนงานในแต่ละวัน"
      >
        <a href="/register" className="button small">
          <Plus size={16} />
          ลงทะเบียนใหม่
        </a>
      </PageHeader>
      <form
        className="toolbar"
        style={{ marginBottom: 22 }}
        onSubmit={(e) => {
          e.preventDefault();
          load(from, to);
        }}
      >
        <label className="field">
          ตั้งแต่วันที่
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label className="field">
          ถึงวันที่
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>
        <button className="button small" disabled={loading}>
          แสดงข้อมูล
        </button>
      </form>
      {error && <ErrorState message={error} />} {loading && <Loading />}
      {data && (
        <>
          <div className="metric-grid">
            {metrics.map((m) => (
              <article className="metric" key={m.label}>
                <div>
                  <div className="label">{m.label}</div>
                  <div className="value">{m.value}</div>
                  <small>{m.hint}</small>
                </div>
                <span className="icon-box">
                  <m.icon size={19} />
                </span>
              </article>
            ))}
          </div>
          <div className="chart-grid">
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>แนวโน้มการนัดหมาย</h2>
                  <p>จำนวนผู้รับบริการตามวันที่นัด</p>
                </div>
                <span className="badge">
                  {data.from} – {data.to}
                </span>
              </div>
              {data.trend.length ? (
                <ResponsiveContainer width="100%" height={235}>
                  <AreaChart data={data.trend}>
                    <defs>
                      <linearGradient
                        id="chart-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#14b8a6"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="#14b8a6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e8eef0"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip />
                    <Area
                      dataKey="count"
                      name="นัดหมาย"
                      stroke="#008f83"
                      fill="url(#chart-fill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState>ไม่มีนัดหมายในช่วงวันที่เลือก</EmptyState>
              )}
            </section>
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>สถานะนัดหมาย</h2>
                  <p>การกระจายตามสถานะล่าสุด</p>
                </div>
              </div>
              {data.statuses.length ? (
                <>
                  <ResponsiveContainer width="100%" height={175}>
                    <PieChart>
                      <Pie
                        data={data.statuses.map((s) => ({
                          ...s,
                          name: statusNames[s.name] ?? s.name,
                        }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={4}
                      >
                        {data.statuses.map((s, i) => (
                          <Cell
                            key={s.name}
                            fill={
                              [
                                "#008f83",
                                "#56b5a4",
                                "#8bd3c1",
                                "#c6e8db",
                                "#f4c66a",
                                "#d87979",
                              ][i % 6]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      justifyContent: "center",
                    }}
                  >
                    {data.statuses.map((s) => (
                      <span className="badge" key={s.name}>
                        {statusNames[s.name]} {s.value}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState>ยังไม่มีข้อมูลสถานะ</EmptyState>
              )}
            </section>
          </div>
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>รายการนัดหมาย</h2>
                <p>
                  ช่วงวันที่เลือก · แสดงสูงสุด 100 รายการ โดยไม่แสดงข้อมูลสุขภาพ
                </p>
              </div>
              <a className="button ghost" href="/admin/appointments">
                จัดการนัดหมาย →
              </a>
            </div>
            {data.bookings.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>เลขที่นัดหมาย</th>
                      <th>วันและเวลา</th>
                      <th>แพ็กเกจ</th>
                      <th>ประมาณการ</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bookings.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.reference}</strong>
                        </td>
                        <td>{dateTime(b.startsAt)}</td>
                        <td>{b.packageName}</td>
                        <td>{money(b.total)}</td>
                        <td>
                          <StatusBadge status={b.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>ยังไม่มีรายการนัดหมายในช่วงนี้</EmptyState>
            )}
          </section>
        </>
      )}
      <div className="quick-actions">
        <a href="/admin/packages" className="button secondary small">
          <Plus size={15} />
          จัดการแพ็กเกจ
        </a>
        <a href="/admin/lab-pricing" className="button secondary small">
          <Download size={15} />
          นำเข้าราคาบริการ
        </a>
        <a href="/admin/appointments" className="button secondary small">
          <CalendarDays size={15} />
          จัดการตารางตรวจ
        </a>
      </div>
    </>
  );
}
