import { addBusinessDays, businessDaysUntil, diffDays, parseISO, today } from "./dates.js";

export type StatusKey = "andamento" | "atrasada" | "entregue" | "entregue_atrasado";
export interface Status { key: StatusKey; delivered: boolean; onTime: boolean | null; delay: number; days: number }

/** Status de cotação/coleta — mesma regra do frontend: Data prevista − hoje (dias corridos). */
export function quoteStatus(q: { dataEmbarque: string; prazoDias: number; entregueEm?: string | null }, now = new Date()): Status {
  const prev = addBusinessDays(q.dataEmbarque, q.prazoDias);
  if (q.entregueEm) {
    const e = parseISO(q.entregueEm);
    const d = prev && e ? diffDays(e, prev) : 0;
    return { key: d <= 0 ? "entregue" : "entregue_atrasado", delivered: true, onTime: d <= 0, delay: Math.max(0, d), days: 0 };
  }
  if (!prev) return { key: "andamento", delivered: false, onTime: null, delay: 0, days: 0 };
  const d = diffDays(prev, today(now));
  return { key: d < 0 ? "atrasada" : "andamento", delivered: false, onTime: null, delay: d < 0 ? -d : 0, days: d };
}

export interface EnvioLike { tipo: "normal" | "flex" | "coleta"; dataLimite?: string | null; dataEntrega?: string | null; statusFlex?: string | null; entregueEm?: string | null }
export const envioPrazo = (e: EnvioLike) => parseISO(e.tipo === "flex" ? e.dataEntrega ?? null : e.dataLimite ?? null);
export const envioDelivered = (e: EnvioLike) => (e.tipo === "flex" ? e.statusFlex === "entregue" : !!e.entregueEm);

/** Status de envio marketplace — prazos em dias úteis, mesma regra do frontend. */
export function envioStatus(e: EnvioLike, now = new Date()): Status {
  const lim = envioPrazo(e), t = today(now);
  if (envioDelivered(e)) {
    const dd = e.entregueEm ? parseISO(e.entregueEm) : null;
    const late = lim && dd && dd > lim ? Math.max(1, businessDaysUntil(lim, dd)) : 0;
    return { key: late ? "entregue_atrasado" : "entregue", delivered: true, onTime: !late, delay: late, days: 0 };
  }
  if (!lim) return { key: "andamento", delivered: false, onTime: null, delay: 0, days: 0 };
  if (t > lim) { const n = businessDaysUntil(lim, t); return { key: "atrasada", delivered: false, onTime: null, delay: n, days: -n }; }
  return { key: "andamento", delivered: false, onTime: null, delay: 0, days: businessDaysUntil(t, lim) };
}
