import type { Database, Param } from "../../db/database.js";
import { parseHist, type AuditFields } from "../shared/audit.js";
import type { Filial, FilialRow } from "./model.js";

export const toFilial = (r: FilialRow): Filial => ({ id: r.id, nome: r.nome, codigo: r.codigo ?? "", ativa: !!Number(r.ativa), criadoEm: r.criado_em, criadoPor: r.criado_por, alteradoEm: r.alterado_em, alteradoPor: r.alterado_por, historico: parseHist(r.historico) });

export class FiliaisRepository {
  constructor(private readonly db: Database) {}
  findById(id: string, db: Database = this.db) { return db.get<FilialRow>("SELECT * FROM filiais WHERE id = ?", [id]); }
  findByChave(k: string, db: Database = this.db) { return db.get<FilialRow>("SELECT * FROM filiais WHERE nome_chave = ?", [k]); }
  findByCodigo(c: string, db: Database = this.db) { return db.get<FilialRow>("SELECT * FROM filiais WHERE codigo = ?", [c]); }
  async list(f: { q?: string; ativa?: boolean; limit: number; offset: number }) {
    const w: string[] = [], p: Param[] = [];
    if (f.q) { w.push("(nome_chave LIKE ? OR codigo LIKE ?)"); const l = `%${f.q.toLowerCase().replace(/[%_]/g, "")}%`; p.push(l, l); }
    if (f.ativa !== undefined) { w.push("ativa = ?"); p.push(f.ativa ? 1 : 0); }
    const ws = w.length ? `WHERE ${w.join(" AND ")}` : "";
    const total = Number((await this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM filiais ${ws}`, p))?.n ?? 0);
    const rows = await this.db.query<FilialRow>(`SELECT * FROM filiais ${ws} ORDER BY nome_chave LIMIT ? OFFSET ?`, [...p, f.limit, f.offset]);
    return { rows, total };
  }
  insert(db: Database, f: { id: string; nome: string; chave: string; codigo: string | null; ativa: boolean }, a: AuditFields) {
    return db.run(`INSERT INTO filiais (id, nome, nome_chave, codigo, ativa, criado_em, criado_por, alterado_em, alterado_por, historico) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [f.id, f.nome, f.chave, f.codigo, f.ativa ? 1 : 0, a.criadoEm, a.criadoPor, a.alteradoEm, a.alteradoPor, JSON.stringify(a.historico)]);
  }
  update(db: Database, id: string, f: { nome: string; chave: string; codigo: string | null; ativa: boolean }, a: AuditFields) {
    return db.run(`UPDATE filiais SET nome = ?, nome_chave = ?, codigo = ?, ativa = ?, alterado_em = ?, alterado_por = ?, historico = ? WHERE id = ?`,
      [f.nome, f.chave, f.codigo, f.ativa ? 1 : 0, a.alteradoEm, a.alteradoPor, JSON.stringify(a.historico), id]);
  }
  delete(db: Database, id: string) { return db.run("DELETE FROM filiais WHERE id = ?", [id]); }
}
