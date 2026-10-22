export async function request<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch("/api/v1/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined || data instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      data === undefined
        ? undefined
        : data instanceof FormData
          ? data
          : JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? "ไม่สามารถดำเนินการได้");
  return result.data as T;
}
export const money = (v: string | number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(
    Number(v),
  );
export const dateTime = (v: string) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
export type PublicPackage = {
  id: string;
  name: string;
  description: string;
  audience: string;
  price: string;
  minAge: number;
  maxAge: number;
  preparation: string;
  version: number;
  items: { id: string; code: string; nameTh: string; mode: string }[];
};
export type PublicService = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  category: string;
  price: string | null;
  requiresReview: boolean;
  componentCodes: string[];
};
