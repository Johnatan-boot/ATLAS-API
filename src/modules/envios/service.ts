import type { Database } from "../../db/database.js";
import { notFound, unprocessable } from "../../errors/app-error.js";
import type { AuthUser } from "../../types/auth.js";
import { newId, skuKey } from "../../utils/ids.js";
import { auditLog, stamp } from "../shared/audit.js";
import { round2, toISO, today } from "../shared/dates.js";
import { envioStatus, type StatusKey } from "../shared/status.js";
import type { ProdutosRepository } from "../produtos/repository.js";
import type { EnvioDoc, EnvioProduto, StatusFlex } from "./model.js";
import type { EnviosRepository } from "./repository.js";
import { EnvioBody, type EnvioInput, type EnvioPatchInput } from "./schema.js";

const FLEX_LABEL: Record<StatusFlex, string> = { faturado: "Faturado", em_rota: "Em rota", entregue: "Entregue" };

export class EnviosService {
  constructor(private readonly db: Database, readonly repo: EnviosRepository, private readonly produtos: ProdutosRepository) {}

  async list(q: { tipo?: "normal" | "flex" | "coleta"; status?: StatusKey; cliente?: string; transportadora?: string; de?: string; ate?: string; page: number; pageSize: number }) {
    let rows = await this.repo.list(q);
    if (q.status) rows = rows.filter(e => envioStatus(e).key === q.status); // status depende de dias úteis: calculado no servidor
    const total = rows.length, start = (q.page - 1) * q.pageSize;
    return { data: rows.slice(start, start + q.pageSize), page: q.page, pageSize: q.pageSize, total };
  }
  async get(id: string) { const d = await this.repo.find(id); if (!d) throw notFound("Envio não encontrado."); return d; }

  private async build(tx: Database, i: EnvioInput, prev: EnvioDoc | null) {
    const prevBySku = new Map((prev?.produtos ?? []).map(p => [skuKey(p.sku), p]));
    const produtos: EnvioProduto[] = [];
    for (const it of i.produtos) {
      const k = skuKey(it.sku), cat = await this.produtos.find(k, tx), old = prevBySku.get(k);
      if (!cat && !old) throw unprocessable(`Produto ${it.sku} não encontrado no cadastro.`);
      const valorUnit = round2(it.valorUnit);
      produtos.push({ sku: cat ? cat.sku : (old?.sku ?? it.sku), nome: it.nome || cat?.descricao || old?.nome || "", qtd: it.qtd, valorUnit, valorCatalogo: cat ? Number(cat.valor) : (old?.valorCatalogo ?? null), subtotal: round2(valorUnit * it.qtd) });
    }
    const valorNF = round2(produtos.reduce((a, p) => a + p.subtotal, 0));
    if (i.tipo === "flex") {
      if (!i.dataEntrega) throw unprocessable("Informe a data de entrega do Flex.");
      const statusFlex = (i.statusFlex || "faturado") as StatusFlex;
      let entregueEm: string | null = null;
      if (statusFlex === "entregue") entregueEm = i.entregueEm ?? (prev?.statusFlex === "entregue" ? prev.entregueEm : null) ?? toISO(today());
      return { cliente: i.cliente, pedido: i.pedido, produtos, valorNF, tipo: i.tipo, dataEntrega: i.dataEntrega, statusFlex, entregueEm, dataFaturamento: "", dataLimite: "", transportadora: "" };
    }
    if (!i.dataFaturamento) throw unprocessable("Informe a data de faturamento.");
    if (!i.dataLimite) throw unprocessable(i.tipo === "coleta" ? "Informe a previsão de coleta." : "Informe a data limite de entrega.");
    if (i.dataLimite < i.dataFaturamento) throw unprocessable(i.tipo === "coleta" ? "A previsão de coleta não pode ser anterior ao faturamento." : "A data limite não pode ser anterior ao faturamento.");
    if (!i.transportadora) throw unprocessable("Informe a transportadora responsável.");
    const entregueEm = i.entregueEm ?? null;
    if (entregueEm && entregueEm < i.dataFaturamento) throw unprocessable("A data de entrega não pode ser anterior ao faturamento.");
    return { cliente: i.cliente, pedido: i.pedido, produtos, valorNF, tipo: i.tipo, dataFaturamento: i.dataFaturamento, dataLimite: i.dataLimite, transportadora: i.transportadora, dataEntrega: "", statusFlex: "" as const, entregueEm };
  }
  private acaoDe(prev: EnvioDoc | null, n: { tipo: string; statusFlex: string; entregueEm: string | null }, informada?: string) {
    if (informada) return informada;
    if (!prev) return "Criação";
    if (n.tipo === "flex" && prev.statusFlex !== n.statusFlex && n.statusFlex) return `Status Flex: ${FLEX_LABEL[n.statusFlex as StatusFlex]}`;
    if (!prev.entregueEm && n.entregueEm) return "Marcado como entregue";
    if (prev.entregueEm && !n.entregueEm) return "Entrega reaberta";
    return "Edição";
  }
  async create(user: AuthUser, i: EnvioInput) {
    const id = newId("e_");
    await this.db.transaction(async tx => { const b = await this.build(tx, i, null); const a = stamp(null, user, this.acaoDe(null, b, i.acao)); await this.repo.insert(tx, { ...b, id, ...a, atualizadoEm: a.alteradoEm }); });
    return this.get(id);
  }
  async replace(user: AuthUser, id: string, i: EnvioInput) {
    await this.db.transaction(async tx => {
      const prev = await this.repo.find(id, tx); if (!prev) throw notFound("Envio não encontrado.");
      const b = await this.build(tx, i, prev); const a = stamp(prev, user, this.acaoDe(prev, b, i.acao));
      await this.repo.update(tx, { ...b, id, ...a, atualizadoEm: a.alteradoEm });
    });
    return this.get(id);
  }
  async patch(user: AuthUser, id: string, p: EnvioPatchInput) {
    const prev = await this.get(id);
    const merged = EnvioBody.parse({ cliente: prev.cliente, pedido: prev.pedido, produtos: prev.produtos, tipo: prev.tipo, dataFaturamento: prev.dataFaturamento, dataLimite: prev.dataLimite,
      transportadora: prev.transportadora, dataEntrega: prev.dataEntrega, statusFlex: prev.statusFlex, entregueEm: prev.entregueEm, ...p });
    return this.replace(user, id, merged);
  }
  async remove(user: AuthUser, id: string) {
    await this.db.transaction(async tx => {
      const prev = await this.repo.find(id, tx); if (!prev) throw notFound("Envio não encontrado.");
      await this.repo.delete(tx, id); await auditLog(tx, user, "envios.excluir", "envio", id, { pedido: prev.pedido });
    });
  }
}
