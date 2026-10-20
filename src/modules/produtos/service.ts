import type { Database } from "../../db/database.js";
import { badRequest, notFound } from "../../errors/app-error.js";
import type { AuthUser } from "../../types/auth.js";
import { skuKey } from "../../utils/ids.js";
import { auditLog, parseHist, stamp } from "../shared/audit.js";
import { round2, round3 } from "../shared/dates.js";
import type { Produto, ProdutoInput, ProdutoRow } from "./model.js";
import { ProdutosRepository, toProduto } from "./repository.js";

const auditOf = (r: ProdutoRow) => ({ criadoEm: r.criado_em, criadoPor: r.criado_por, alteradoEm: r.alterado_em, alteradoPor: r.alterado_por, historico: parseHist(r.historico) });
const clean = (p: ProdutoInput): ProdutoInput => ({ ...p, sku: p.sku.trim(), valor: round2(p.valor), peso: p.peso === null ? null : round3(p.peso) });

export class ProdutosService {
  constructor(private readonly db: Database, readonly repo: ProdutosRepository) {}
  async list(q: { q?: string; grupo?: string; familia?: string; fornecedor?: string; page: number; pageSize: number }) {
    const { rows, total } = await this.repo.list({ ...q, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
    return { data: rows.map(toProduto), page: q.page, pageSize: q.pageSize, total };
  }
  async get(sku: string): Promise<Produto> { const r = await this.repo.find(skuKey(sku)); if (!r) throw notFound("Produto não encontrado."); return toProduto(r); }

  private async upsertTx(tx: Database, actor: AuthUser, p: ProdutoInput, acao?: string) {
    const k = skuKey(p.sku), cur = await this.repo.find(k, tx), v = clean(p);
    if (cur) { await this.repo.update(tx, k, v, stamp(auditOf(cur), actor, acao ?? "Edição", 15)); return "atualizado" as const; }
    await this.repo.insert(tx, k, v, stamp(null, actor, acao ?? "Cadastro", 15)); return "novo" as const;
  }
  async upsert(actor: AuthUser, skuParam: string, body: Omit<ProdutoInput, "sku"> & { sku?: string; acao?: string }) {
    if (body.sku && skuKey(body.sku) !== skuKey(skuParam)) throw badRequest("O SKU do corpo difere do SKU da URL.");
    const r = await this.db.transaction(tx => this.upsertTx(tx, actor, { ...body, sku: body.sku ?? skuParam }, body.acao));
    return { resultado: r, data: await this.get(skuParam) };
  }
  /** Importação de planilha: tudo ou nada (transação única). SKU existente é atualizado. */
  async upsertMany(actor: AuthUser, itens: (ProdutoInput & { acao?: string })[], acao = "Importação de planilha") {
    let novos = 0, atualizados = 0;
    await this.db.transaction(async tx => { for (const it of itens) (await this.upsertTx(tx, actor, it, acao)) === "novo" ? novos++ : atualizados++; });
    return { novos, atualizados };
  }
  async remove(actor: AuthUser, sku: string) {
    await this.db.transaction(async tx => {
      const k = skuKey(sku), cur = await this.repo.find(k, tx); if (!cur) throw notFound("Produto não encontrado.");
      await this.repo.delete(tx, k);
      await auditLog(tx, actor, "produto.excluir", "produto", cur.sku);
    });
  }
}
