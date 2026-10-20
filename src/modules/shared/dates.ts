/**
 * Regras de datas idênticas às do frontend ATLAS:
 * - dias úteis = segunda a sexta, excluindo feriados nacionais fixos e a Sexta-feira Santa;
 * - datas no formato ISO local YYYY-MM-DD (sem fuso).
 */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseISO(s: string | null | undefined): Date | null {
  if (!s || !ISO_DATE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}
export const isValidISODate = (s: string) => parseISO(s) !== null;
export function today(now = new Date()): Date { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
export const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 864e5);

export function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
const holidayCache = new Map<number, Set<string>>();
export function holidays(y: number): Set<string> {
  const c = holidayCache.get(y); if (c) return c;
  const set = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map(md => `${y}-${md}`));
  const gf = easter(y); gf.setDate(gf.getDate() - 2); set.add(toISO(gf));
  holidayCache.set(y, set); return set;
}
export const isBusiness = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !holidays(d.getFullYear()).has(toISO(d));
/** Soma n dias úteis a partir do dia seguinte a iso. */
export function addBusinessDays(iso: string, n: number): Date | null {
  const d = parseISO(iso); if (!d || !(n > 0)) return null;
  let left = Math.floor(n);
  while (left > 0) { d.setDate(d.getDate() + 1); if (isBusiness(d)) left--; }
  return d;
}
/** Dias úteis após "from" até "to" (inclusive). */
export function businessDaysUntil(from: Date, to: Date): number {
  let n = 0; const d = new Date(from);
  while (d < to) { d.setDate(d.getDate() + 1); if (isBusiness(d)) n++; }
  return n;
}
export function subBusinessDays(date: Date, n: number): Date {
  const d = new Date(date); let left = n;
  while (left > 0) { d.setDate(d.getDate() - 1); if (isBusiness(d)) left--; }
  return d;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
