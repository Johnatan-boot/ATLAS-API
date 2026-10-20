import type { Database, Param } from "../../db/database.js";
import { parseHist, type AuditFields } from "../shared/audit.js";
import type { Produto, ProdutoInput, ProdutoRow } from "./model.js";

export const toProduto = (r: ProdutoRow): Produto => ({ sku: r.sku, descricao: r.descricao, grupo: r.grupo, familia: r.familia, fornecedor: r.fornecedor, valor: Number(r.valor), peso: r.peso === null ? null : Number(r.peso), criadoEm: r.criado_em, criadoPor: r.criado_por, alteradoEm: r.alterado_em, alteradoPor: r.alterado_por, historico: parseHist(r.historico) });

export class ProdutosRepository {
  constructor(private readonly db: Database) {}
  find(k: string, db: Database = this.db) { return db.get<ProdutoRow>("SELECT * FROM produtos WHERE sku_chave = ?", [k]); }
  async list(f: { q?: string; grupo?: string; familia?: string; fornecedor?: string; limit: number; offset: number }) {
    const w: string[] = [], p: Param[] = [];
    if (f.q) { w.push("(sku_chave LIKE ? OR LOWER(descricao) LIKE ?)"); const l = f.q.replace(/[%_]/g, ""); p.push(`%${l.toUpperCase()}%`, `%${l.toLowerCase()}%`); }
    if (f.grupo) { w.push("grupo = ?"); p.push(f.grupo); }
    if (f.familia) { w.push("familia = ?"); p.push(f.familia); }
    if (f.fornecedor) { w.push("fornecedor = ?"); p.push(f.fornecedor); }
    const ws = w.length ? `WHERE ${w.join(" AND ")}` : "";
    const total = Number((await this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM produtos ${ws}`, p))?.n ?? 0);
    const rows = await this.db.query<ProdutoRow>(`SELECT * FROM produtos ${ws} ORDER BY sku_chave LIMIT ? OFFSET ?`, [...p, f.limit, f.offset]);
    return { rows, total };
  }
  insert(db: Database, k: string, p: ProdutoInput, a: AuditFields) {
    return db.run(`INSERT INTO produtos (sku_chave, sku, descricao, grupo, familia, fornecedor, valor, peso, criado_em, criado_por, alterado_em, alterado_por, historico) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [k, p.sku, p.descricao, p.grupo, p.familia, p.fornecedor, p.valor, p.peso, a.criadoEm, a.criadoPor, a.alteradoEm, a.alteradoPor, JSON.stringify(a.historico)]);
  }
  update(db: Database, k: string, p: ProdutoInput, a: AuditFields) {
    return db.run(`UPDATE produtos SET descricao = ?, grupo = ?, familia = ?, fornecedor = ?, valor = ?, peso = ?, alterado_em = ?, alterado_por = ?, historico = ? WHERE sku_chave = ?`,
      [p.descricao, p.grupo, p.familia, p.fornecedor, p.valor, p.peso, a.alteradoEm, a.alteradoPor, JSON.stringify(a.historico), k]);
  }
  delete(db: Database, k: string) { return db.run("DELETE FROM produtos WHERE sku_chave = ?", [k]); }
}
