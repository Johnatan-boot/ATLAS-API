import { round2, toISO, diffDays, parseISO } from "../shared/dates.js";
import { envioStatus, quoteStatus } from "../shared/status.js";
import type { CotacaoDoc } from "../cotacoes/model.js";
import type { EnvioDoc } from "../envios/model.js";
import type { Faixa, Filtro, ResumoPedidos } from "./model.js";
import type { IndicadoresRepository } from "./repository.js";

const div = (a: number, b: number) => (b > 0 ? a / b : null); // evita divisão por zero
const r4 = (n: number | null) => (n === null ? null : Math.round(n * 10000) / 10000);

/** Faixas de entregas no prazo usadas no frontend: ≥90% verde, 70–89,9% atenção, <70% crítico. */
export function faixaOTD(otd: number | null): Faixa {
  const regra = "OTD = entregas concluídas até a data prevista ÷ entregas concluídas. ≥ 90% verde; 70% a 89,9% atenção; < 70% crítico.";
  if (otd === null) return { faixa: "sem_dados", regra };
  return { faixa: otd >= 0.9 ? "verde" : otd >= 0.7 ? "atencao" : "critico", regra };
}

export function resumoPedidos(L: CotacaoDoc[], now = new Date()): ResumoPedidos {
  const st = L.map(q => ({ q, s: quoteStatus(q, now) }));
  const del = st.filter(x => x.s.delivered), ok = del.filter(x => x.s.onTime).length, lateDel = del.filter(x => !x.s.onTime);
  const late = st.filter(x => x.s.key === "atrasada"), run = st.filter(x => x.s.key === "andamento");
  const ped = round2(L.reduce((a, q) => a + (q.valorPedido || 0), 0)), fre = round2(L.reduce((a, q) => a + (q.valorFrete || 0), 0));
  return {
    n: L.length, emRota: run.length + late.length, entregues: del.length, noPrazo: ok, comAtraso: lateDel.length, otd: r4(div(ok, del.length)),
    atrasadasAgora: late.length, maiorAtraso: late.reduce((m, x) => Math.max(m, x.s.delay), 0),
    atrasoMedio: lateDel.length ? round2(lateDel.reduce((a, x) => a + x.s.delay, 0) / lateDel.length) : null,
    valorPedidos: ped, freteTotal: fre, fretePct: r4(div(fre, ped)), ticketMedio: L.length ? round2(ped / L.length) : null, freteMedio: L.length ? round2(fre / L.length) : null,
  };
}

/** Indicadores da Calculadora de frete: vitórias contam apenas pedidos com 2+ cotações (mesma regra do frontend). */
export function calculadora(L: CotacaoDoc[]) {
  const T = new Map<string, { nome: string; cotacoes: number; pedidos: Set<string>; somaValor: number; somaPrazo: number; vitPreco: number; vitPrazo: number; comparacoes: number; escolhida: number }>();
  const get = (n: string) => { let t = T.get(n); if (!t) { t = { nome: n, cotacoes: 0, pedidos: new Set(), somaValor: 0, somaPrazo: 0, vitPreco: 0, vitPrazo: 0, comparacoes: 0, escolhida: 0 }; T.set(n, t); } return t; };
  let nQuotes = 0, nPed = 0, nComp = 0, econ = 0;
  for (const q of L) {
    const ops = q.opcoes?.length ? q.opcoes : [{ numero: q.numeroCotacao, transportadora: q.transportadora, valorFrete: q.valorFrete, prazoDias: q.prazoDias }];
    nPed++; nQuotes += ops.length;
    ops.forEach(o => { const t = get(o.transportadora); t.cotacoes++; t.pedidos.add(q.id); t.somaValor += o.valorFrete; t.somaPrazo += o.prazoDias; });
    get(q.transportadora).escolhida++;
    if (ops.length >= 2) {
      nComp++;
      const p = [...ops].sort((a, b) => a.valorFrete - b.valorFrete || a.prazoDias - b.prazoDias)[0]!;
      const z = [...ops].sort((a, b) => a.prazoDias - b.prazoDias || a.valorFrete - b.valorFrete)[0]!;
      get(p.transportadora).vitPreco++; get(z.transportadora).vitPrazo++;
      new Set(ops.map(o => o.transportadora)).forEach(n => get(n).comparacoes++);
      econ += Math.max(0, Math.max(...ops.map(o => o.valorFrete)) - q.valorFrete);
    }
  }
  const rows = [...T.values()].map(t => ({ transportadora: t.nome, cotacoes: t.cotacoes, pedidos: t.pedidos.size, freteMedio: round2(t.somaValor / t.cotacoes), prazoMedio: round2(t.somaPrazo / t.cotacoes),
    vitoriasPreco: t.vitPreco, vitoriasPrazo: t.vitPrazo, comparacoes: t.comparacoes, taxaPreco: r4(div(t.vitPreco, t.comparacoes)), taxaPrazo: r4(div(t.vitPrazo, t.comparacoes)), escolhida: t.escolhida }));
  const melhorPreco = rows.filter(r => r.vitoriasPreco).sort((a, b) => b.vitoriasPreco - a.vitoriasPreco || (b.taxaPreco ?? 0) - (a.taxaPreco ?? 0) || a.freteMedio - b.freteMedio)[0] ?? null;
  const melhorPrazo = rows.filter(r => r.vitoriasPrazo).sort((a, b) => b.vitoriasPrazo - a.vitoriasPrazo || (b.taxaPrazo ?? 0) - (a.taxaPrazo ?? 0) || a.prazoMedio - b.prazoMedio)[0] ?? null;
  return { cotacoesRealizadas: nQuotes, pedidos: nPed, pedidosComComparacao: nComp, transportadorasCotadas: rows.length, economiaFrenteMaisCara: round2(econ), melhorPreco: melhorPreco?.transportadora ?? null, melhorPrazo: melhorPrazo?.transportadora ?? null, porTransportadora: rows.sort((a, b) => b.cotacoes - a.cotacoes) };
}

export class IndicadoresService {
  constructor(private readonly repo: IndicadoresRepository) {}
  private filtrar(L: CotacaoDoc[], f: Filtro) {
    return L.filter(q => (!f.de || q.dataEmbarque >= f.de) && (!f.ate || q.dataEmbarque <= f.ate) && (!f.transportadora || q.transportadora === f.transportadora) && (!f.uf || q.uf === f.uf) && (!f.filial || q.filial === f.filial));
  }
  async pedidos(modulo: "cotacoes" | "coletas", f: Filtro, now = new Date()) {
    const all = await this.repo.pedidos(modulo), L = this.filtrar(all, f), resumo = resumoPedidos(L, now);
    let anterior: ResumoPedidos | null = null, periodoAnterior: { de: string; ate: string } | null = null;
    const a = parseISO(f.de), b = parseISO(f.ate);
    if (a && b) {
      const len = diffDays(b, a) + 1, pb = new Date(a); pb.setDate(pb.getDate() - 1); const pa = new Date(pb); pa.setDate(pa.getDate() - len + 1);
      periodoAnterior = { de: toISO(pa), ate: toISO(pb) };
      anterior = resumoPedidos(this.filtrar(all, { ...f, ...periodoAnterior }), now);
    }
    const agrupar = (key: (q: CotacaoDoc) => string) => {
      const m = new Map<string, CotacaoDoc[]>(); L.forEach(q => { const k = key(q) || "—"; m.set(k, [...(m.get(k) ?? []), q]); });
      return [...m.entries()].map(([chave, arr]) => ({ chave, ...resumoPedidos(arr, now) })).sort((x, y) => y.n - x.n);
    };
    // Calculadora ignora o filtro de transportadora (que considera só a escolhida e distorceria a comparação).
    const calc = calculadora(this.filtrar(all, { ...f, transportadora: undefined }));
    return { filtro: f, resumo, faixa: faixaOTD(resumo.otd), periodoAnterior, anterior, porTransportadora: agrupar(q => q.transportadora), porUF: agrupar(q => q.uf), porFilial: agrupar(q => q.filial), calculadora: calc };
  }
  async envios(f: { de?: string; ate?: string; tipo?: "normal" | "flex" | "coleta"; transportadora?: string }, now = new Date()) {
    const ref = (e: EnvioDoc) => (e.tipo === "flex" ? e.dataEntrega : e.dataFaturamento);
    const L = (await this.repo.envios()).filter(e => (!f.de || ref(e) >= f.de) && (!f.ate || ref(e) <= f.ate) && (!f.tipo || e.tipo === f.tipo) && (!f.transportadora || e.transportadora === f.transportadora));
    const res = (arr: EnvioDoc[]) => {
      const st = arr.map(e => envioStatus(e, now)), del = st.filter(s => s.delivered), ok = del.filter(s => s.onTime).length;
      return { n: arr.length, valorNF: round2(arr.reduce((a, e) => a + (e.valorNF || 0), 0)), entregues: del.length, noPrazo: ok, comAtraso: del.length - ok, otd: r4(div(ok, del.length)),
        atrasadosAgora: st.filter(s => s.key === "atrasada").length, emAndamento: st.filter(s => s.key === "andamento").length };
    };
    const resumo = res(L);
    const porTipo = (["normal", "flex", "coleta"] as const).map(t => ({ tipo: t, ...res(L.filter(e => e.tipo === t)) }));
    const tm = new Map<string, EnvioDoc[]>(); L.filter(e => e.tipo !== "flex" && e.transportadora).forEach(e => tm.set(e.transportadora, [...(tm.get(e.transportadora) ?? []), e]));
    return { filtro: f, resumo, faixa: faixaOTD(resumo.otd), porTipo, porTransportadora: [...tm.entries()].map(([t, arr]) => ({ transportadora: t, ...res(arr) })).sort((a, b) => b.n - a.n) };
  }
}
