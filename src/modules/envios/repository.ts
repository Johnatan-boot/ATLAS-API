import type { Database, Param } from "../../db/database.js";
import { parseHist } from "../shared/audit.js";
import type { EnvioDoc, EnvioRow, TipoEnvio } from "./model.js";

export class EnviosRepository {
  constructor(private readonly db: Database) {}
  toDoc(r: EnvioRow): EnvioDoc {
    const d = JSON.parse(r.dados) as Omit<EnvioDoc, "id" | "criadoEm" | "criadoPor" | "alteradoEm" | "alteradoPor" | "atualizadoEm" | "historico">;
    return { ...d, id: r.id, criadoEm: r.criado_em, criadoPor: r.criado_por, alteradoEm: r.alterado_em, alteradoPor: r.alterado_por, atualizadoEm: r.alterado_em, historico: parseHist(r.historico) };
  }
  async find(id: string, db: Database = this.db) { const r = await db.get<EnvioRow>("SELECT * FROM envios WHERE id = ?", [id]); return r ? this.toDoc(r) : null; }
  async list(f: { tipo?: TipoEnvio; cliente?: string; transportadora?: string; de?: string; ate?: string }) {
    const w: string[] = [], p: Param[] = [];
    if (f.tipo) { w.push("tipo = ?"); p.push(f.tipo); }
    if (f.cliente) { w.push("LOWER(cliente) LIKE ?"); p.push(`%${f.cliente.toLowerCase().replace(/[%_]/g, "")}%`); }
    if (f.transportadora) { w.push("transportadora = ?"); p.push(f.transportadora); }
    // Data de referência igual à do frontend: faturamento (Normal/Coleta) ou entrega (Flex).
    if (f.de) { w.push("(CASE WHEN tipo = 'flex' THEN data_entrega ELSE data_faturamento END) >= ?"); p.push(f.de); }
    if (f.ate) { w.push("(CASE WHEN tipo = 'flex' THEN data_entrega ELSE data_faturamento END) <= ?"); p.push(f.ate); }
    const ws = w.length ? `WHERE ${w.join(" AND ")}` : "";
    return (await this.db.query<EnvioRow>(`SELECT * FROM envios ${ws} ORDER BY criado_em DESC, id`, p)).map(r => this.toDoc(r));
  }
  private cols(d: EnvioDoc): Param[] {
    const { id: _i, criadoEm: _a, criadoPor: _b, alteradoEm: _c, alteradoPor: _d, atualizadoEm: _e, historico: _f, ...dados } = d;
    return [d.cliente, d.pedido, d.tipo, d.transportadora, d.dataFaturamento || null, d.dataLimite || null, d.dataEntrega || null, d.statusFlex || null, d.entregueEm, d.valorNF, JSON.stringify(dados)];
  }
  insert(db: Database, d: EnvioDoc) {
    return db.run(`INSERT INTO envios (cliente, pedido, tipo, transportadora, data_faturamento, data_limite, data_entrega, status_flex, entregue_em, valor_nf, dados, id, criado_em, criado_por, alterado_em, alterado_por, historico)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...this.cols(d), d.id, d.criadoEm, d.criadoPor, d.alteradoEm, d.alteradoPor, JSON.stringify(d.historico)]);
  }
  update(db: Database, d: EnvioDoc) {
    return db.run(`UPDATE envios SET cliente=?, pedido=?, tipo=?, transportadora=?, data_faturamento=?, data_limite=?, data_entrega=?, status_flex=?, entregue_em=?, valor_nf=?, dados=?, alterado_em=?, alterado_por=?, historico=? WHERE id=?`,
      [...this.cols(d), d.alteradoEm, d.alteradoPor, JSON.stringify(d.historico), d.id]);
  }
  delete(db: Database, id: string) { return db.run("DELETE FROM envios WHERE id = ?", [id]); }
  all(db: Database = this.db) { return db.query<EnvioRow>("SELECT * FROM envios").then(rs => rs.map(r => this.toDoc(r))); }
}
