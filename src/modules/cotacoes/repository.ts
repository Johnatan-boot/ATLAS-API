import type { Database, Param } from "../../db/database.js";
import { parseHist } from "../shared/audit.js";
import { toISO, today } from "../shared/dates.js";
import type { CotacaoDoc, PedidoRow, StatusFiltro } from "./model.js";

export type PedidoTable = "cotacoes" | "coletas";
export interface ListFilter { status?: StatusFiltro; cliente?: string; transportadora?: string; uf?: string; filial?: string; periodo: "embarque" | "previsao"; de?: string; ate?: string; limit: number; offset: number }

/** Persistência de cotações/coletas: colunas indexadas para filtros + documento completo (contrato do frontend) em JSON. */
export class PedidosRepository {
  constructor(private readonly db: Database, readonly table: PedidoTable) {}

  toDoc(r: PedidoRow): CotacaoDoc {
    const d = JSON.parse(r.dados) as Omit<CotacaoDoc, "id" | "criadoEm" | "criadoPor" | "alteradoEm" | "alteradoPor" | "historico" | "atualizadoEm">;
    return { ...d, id: r.id, criadoEm: r.criado_em, criadoPor: r.criado_por, alteradoEm: r.alterado_em, alteradoPor: r.alterado_por, atualizadoEm: r.alterado_em, historico: parseHist(r.historico) };
  }
  async find(id: string, db: Database = this.db) { const r = await db.get<PedidoRow>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]); return r ? this.toDoc(r) : null; }

  async list(f: ListFilter) {
    const w: string[] = [], p: Param[] = [];
    const t = toISO(today());
    if (f.status === "entregue") w.push("entregue_em IS NOT NULL AND entregue_em <= data_prevista");
    if (f.status === "entregue_atrasado") w.push("entregue_em IS NOT NULL AND entregue_em > data_prevista");
    if (f.status === "atrasada") { w.push("entregue_em IS NULL AND data_prevista < ?"); p.push(t); }
    if (f.status === "andamento") { w.push("entregue_em IS NULL AND data_prevista >= ?"); p.push(t); }
    if (f.cliente) { w.push("LOWER(cliente) LIKE ?"); p.push(`%${f.cliente.toLowerCase().replace(/[%_]/g, "")}%`); }
    if (f.transportadora) { w.push("transportadora = ?"); p.push(f.transportadora); }
    if (f.uf) { w.push("uf = ?"); p.push(f.uf); }
    if (f.filial) { w.push("filial = ?"); p.push(f.filial); }
    const col = f.periodo === "previsao" ? "data_prevista" : "data_embarque"; // coluna escolhida de lista fixa (nunca do usuário)
    if (f.de) { w.push(`${col} >= ?`); p.push(f.de); }
    if (f.ate) { w.push(`${col} <= ?`); p.push(f.ate); }
    const ws = w.length ? `WHERE ${w.join(" AND ")}` : "";
    const total = Number((await this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${this.table} ${ws}`, p))?.n ?? 0);
    const rows = await this.db.query<PedidoRow>(`SELECT * FROM ${this.table} ${ws} ORDER BY data_embarque DESC, id LIMIT ? OFFSET ?`, [...p, f.limit, f.offset]);
    return { rows: rows.map(r => this.toDoc(r)), total };
  }
  /** Todos os registros (usado por indicadores, agenda e notificações). */
  async all(db: Database = this.db) { return (await db.query<PedidoRow>(`SELECT * FROM ${this.table} ORDER BY data_embarque`)).map(r => this.toDoc(r)); }

  private cols(d: CotacaoDoc): Param[] {
    const { id: _i, criadoEm: _a, criadoPor: _b, alteradoEm: _c, alteradoPor: _d, atualizadoEm: _e, historico: _f, ...dados } = d;
    return [d.cliente, d.pedido, d.filial, d.transportadora, d.cidade, d.uf, d.dataEmbarque, d.prazoDias, d.dataPrevista, d.entregueEm, d.valorPedido, d.valorFrete, JSON.stringify(dados)];
  }
  insert(db: Database, d: CotacaoDoc) {
    return db.run(`INSERT INTO ${this.table} (cliente, pedido, filial, transportadora, cidade, uf, data_embarque, prazo_dias, data_prevista, entregue_em, valor_pedido, valor_frete, dados, id, criado_em, criado_por, alterado_em, alterado_por, historico)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...this.cols(d), d.id, d.criadoEm, d.criadoPor, d.alteradoEm, d.alteradoPor, JSON.stringify(d.historico)]);
  }
  update(db: Database, d: CotacaoDoc) {
    return db.run(`UPDATE ${this.table} SET cliente=?, pedido=?, filial=?, transportadora=?, cidade=?, uf=?, data_embarque=?, prazo_dias=?, data_prevista=?, entregue_em=?, valor_pedido=?, valor_frete=?, dados=?,
      alterado_em=?, alterado_por=?, historico=? WHERE id=?`, [...this.cols(d), d.alteradoEm, d.alteradoPor, JSON.stringify(d.historico), d.id]);
  }
  delete(db: Database, id: string) { return db.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]); }
}
