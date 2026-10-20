import { nowISO } from "../../utils/ids.js";
import { addBusinessDays, businessDaysUntil, diffDays, isBusiness, parseISO, subBusinessDays, toISO, today } from "../shared/dates.js";
import { envioDelivered, envioPrazo } from "../shared/status.js";
import type { CotacaoDoc } from "../cotacoes/model.js";
import type { PedidosRepository } from "../cotacoes/repository.js";
import type { EnvioDoc } from "../envios/model.js";
import type { EnviosRepository } from "../envios/repository.js";
import { ALERT_DAYS, MAX_DAILY, type ModuloNotif, type Notificacao } from "./model.js";
import type { NotificacoesRepository } from "./repository.js";

const plural = (n: number, a: string, b: string) => (n === 1 ? a : b);
const br = (d: Date) => toISO(d).split("-").reverse().join("/");

/** Gera as notificações a partir dos dados reais (mesma regra e mesmos IDs do frontend, portanto sem duplicidade). */
export function gerarDePedidos(arr: CotacaoDoc[], mod: ModuloNotif, now = new Date()): Omit<Notificacao, "lida">[] {
  const out: Omit<Notificacao, "lida">[] = [], t = today(now);
  for (const q of arr) {
    const prev = addBusinessDays(q.dataEmbarque, q.prazoDias); if (!prev) continue;
    const delivered = q.entregueEm ? parseISO(q.entregueEm) : null;
    const base = { mod, qid: q.id, pedido: q.pedido, cliente: q.cliente, resolved: !!delivered };
    let start = subBusinessDays(prev, ALERT_DAYS);
    const emb = parseISO(q.dataEmbarque); if (emb && start < emb) start = new Date(emb);
    let stop = prev < t ? new Date(prev) : new Date(t);
    if (delivered) { const dl = new Date(delivered); dl.setDate(dl.getDate() - 1); if (dl < stop) stop = dl; }
    for (const d = new Date(start); d <= stop; d.setDate(d.getDate() + 1)) {
      if (!isBusiness(d) && d.getTime() !== start.getTime()) continue;
      const n = businessDaysUntil(d, prev);
      out.push({ ...base, id: `prazo-${q.id}-${toISO(d)}`, type: "prazo", date: toISO(d), days: -n,
        title: n === 0 ? `Pedido ${q.pedido} vence hoje` : `Pedido ${q.pedido} vence em ${n} ${plural(n, "dia útil", "dias úteis")}`,
        msg: `Previsão de entrega em ${br(prev)} e a entrega ainda não foi concluída.` });
    }
    const last = delivered ? new Date(delivered.getTime() - 864e5) : t;
    const first = new Date(prev); first.setDate(first.getDate() + 1);
    const days = diffDays(last, first) + 1;
    for (let i = Math.max(0, days - MAX_DAILY); i < days; i++) {
      const d = new Date(first); d.setDate(d.getDate() + i);
      const x = diffDays(d, prev);
      out.push({ ...base, id: `atraso-${q.id}-${toISO(d)}`, type: "atraso", date: toISO(d), days: x,
        title: `Pedido ${q.pedido} excedeu o prazo há ${x} ${plural(x, "dia", "dias")}`,
        msg: `A entrega já excedeu o limite em ${x} ${plural(x, "dia", "dias")} (previsão era ${br(prev)}).` });
    }
  }
  return out;
}

export function gerarDeEnvios(envs: EnvioDoc[], now = new Date()): Omit<Notificacao, "lida">[] {
  const out: Omit<Notificacao, "lida">[] = [], t = today(now);
  for (const e of envs) {
    const lim = envioPrazo(e); if (!lim) continue;
    const delivered = envioDelivered(e), dd = e.entregueEm ? parseISO(e.entregueEm) : (delivered ? t : null);
    const base = { mod: "env" as const, qid: e.id, pedido: e.pedido, cliente: e.cliente, resolved: delivered };
    const lbl = e.tipo === "flex" ? "entrega" : e.tipo === "coleta" ? "previsão de coleta" : "data limite de entrega";
    let start = subBusinessDays(lim, ALERT_DAYS);
    const ref = parseISO(e.tipo === "flex" ? (e.criadoEm || "").slice(0, 10) : e.dataFaturamento);
    if (ref && start < ref) start = new Date(ref);
    let stop = lim < t ? new Date(lim) : new Date(t);
    if (dd) { const x = new Date(dd); x.setDate(x.getDate() - 1); if (x < stop) stop = x; }
    for (const d = new Date(start); d <= stop; d.setDate(d.getDate() + 1)) {
      if (!isBusiness(d) && d.getTime() !== start.getTime()) continue;
      const n = businessDaysUntil(d, lim);
      out.push({ ...base, id: `eprazo-${e.id}-${toISO(d)}`, type: "prazo", date: toISO(d), days: -n,
        title: n === 0 ? `Envio ${e.pedido}: ${lbl} é hoje` : `Envio ${e.pedido}: faltam ${n} ${plural(n, "dia útil", "dias úteis")} para a ${lbl}`,
        msg: `${e.tipo === "flex" ? "Entrega Flex prevista" : lbl.charAt(0).toUpperCase() + lbl.slice(1)} para ${br(lim)} e o envio ainda não foi concluído.` });
    }
    const last = dd ? new Date(dd.getTime() - 864e5) : t, first = new Date(lim); first.setDate(first.getDate() + 1);
    const days = diffDays(last, first) + 1;
    for (let i = Math.max(0, days - MAX_DAILY); i < days; i++) {
      const d = new Date(first); d.setDate(d.getDate() + i);
      if (!isBusiness(d)) continue;
      const x = Math.max(1, businessDaysUntil(lim, d));
      out.push({ ...base, id: `eatraso-${e.id}-${toISO(d)}`, type: "atraso", date: toISO(d), days: x,
        title: `Envio ${e.pedido} excedeu a ${lbl} há ${x} ${plural(x, "dia útil", "dias úteis")}`,
        msg: `O envio já excedeu a ${lbl} em ${x} ${plural(x, "dia útil", "dias úteis")} (prevista para ${br(lim)}).` });
    }
  }
  return out;
}

export class NotificacoesService {
  constructor(private readonly repo: NotificacoesRepository, private readonly cot: PedidosRepository, private readonly col: PedidosRepository, private readonly env: EnviosRepository) {}
  async list(usuarioId: string, modulos: ModuloNotif[], f: { mod?: ModuloNotif; type?: "prazo" | "atraso"; somenteNaoLidas?: boolean; limit: number }) {
    const want = (m: ModuloNotif) => modulos.includes(m) && (!f.mod || f.mod === m);
    const all = [
      ...(want("cot") ? gerarDePedidos(await this.cot.all(), "cot") : []),
      ...(want("col") ? gerarDePedidos(await this.col.all(), "col") : []),
      ...(want("env") ? gerarDeEnvios(await this.env.all()) : []),
    ];
    const lidas = await this.repo.lidas(usuarioId);
    let list: Notificacao[] = all.map(n => ({ ...n, lida: lidas.has(n.id) }));
    if (f.type) list = list.filter(n => n.type === f.type);
    if (f.somenteNaoLidas) list = list.filter(n => !n.lida && !n.resolved);
    list.sort((a, b) => b.date.localeCompare(a.date) || (a.type === "atraso" ? -1 : 1) || b.days - a.days);
    return { data: list.slice(0, f.limit), total: list.length, naoLidas: list.filter(n => !n.lida && !n.resolved).length };
  }
  marcar(usuarioId: string, ids: string[], lida: boolean) { return this.repo.marcar(usuarioId, ids, lida, nowISO()); }
  async leituras(usuarioId: string) { const s = await this.repo.lidas(usuarioId); return { lidas: Object.fromEntries([...s].map(id => [id, true])) }; }
  salvarLeituras(usuarioId: string, lidas: Record<string, boolean>) { return this.repo.substituir(usuarioId, Object.entries(lidas).filter(([, v]) => v).map(([k]) => k), nowISO()); }
}
