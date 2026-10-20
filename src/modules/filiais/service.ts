import type { Database } from "../../db/database.js";
import { conflict, notFound, unprocessable } from "../../errors/app-error.js";
import type { AuthUser } from "../../types/auth.js";
import { nameKey, newId } from "../../utils/ids.js";
import { auditLog, parseHist, stamp } from "../shared/audit.js";
import type { Filial, FilialRow } from "./model.js";
import { FiliaisRepository, toFilial } from "./repository.js";

const auditOf = (r: FilialRow) => ({ criadoEm: r.criado_em, criadoPor: r.criado_por, alteradoEm: r.alterado_em, alteradoPor: r.alterado_por, historico: parseHist(r.historico) });

export class FiliaisService {
  constructor(private readonly db: Database, readonly repo: FiliaisRepository) {}
  async list(q: { q?: string; ativa?: boolean; page: number; pageSize: number }) {
    const { rows, total } = await this.repo.list({ ...q, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
    return { data: rows.map(toFilial), page: q.page, pageSize: q.pageSize, total };
  }
  async get(id: string): Promise<Filial> { const r = await this.repo.findById(id); if (!r) throw notFound("Filial não encontrada."); return toFilial(r); }

  private async checkCodigo(tx: Database, codigo: string | null, selfId: string | null) {
    if (!codigo) return;
    const o = await this.repo.findByCodigo(codigo, tx);
    if (o && o.id !== selfId) throw conflict("Este código já é usado por outra filial.");
  }
  async create(actor: AuthUser, f: { nome: string; codigo: string; ativa: boolean }, acao = "Cadastro"): Promise<Filial> {
    const id = newId("f_");
    await this.db.transaction(async tx => {
      if (await this.repo.findByChave(nameKey(f.nome), tx)) throw conflict("Já existe uma filial com este nome.");
      await this.checkCodigo(tx, f.codigo || null, null);
      await this.repo.insert(tx, { id, nome: f.nome, chave: nameKey(f.nome), codigo: f.codigo || null, ativa: f.ativa }, stamp(null, actor, acao, 15));
    });
    return this.get(id);
  }
  async update(actor: AuthUser, id: string, p: { nome?: string; codigo?: string; ativa?: boolean }): Promise<Filial> {
    await this.db.transaction(async tx => {
      const cur = await this.repo.findById(id, tx); if (!cur) throw notFound("Filial não encontrada.");
      // Regra do ATLAS: o nome não pode ser alterado depois de cadastrado (preserva histórico de cotações e indicadores).
      if (p.nome !== undefined && nameKey(p.nome) !== cur.nome_chave) throw unprocessable("O nome da filial não pode ser alterado.");
      const codigo = p.codigo === undefined ? cur.codigo : (p.codigo || null);
      await this.checkCodigo(tx, codigo, id);
      const ativa = p.ativa ?? !!Number(cur.ativa);
      const acao = ativa !== !!Number(cur.ativa) ? (ativa ? "Ativada" : "Desativada") : "Edição";
      await this.repo.update(tx, id, { nome: cur.nome, chave: cur.nome_chave, codigo, ativa }, stamp(auditOf(cur), actor, acao, 15));
    });
    return this.get(id);
  }
  /** Importação em lote: cria as novas e atualiza código/situação das existentes (pelo nome), tudo em uma transação. */
  async upsertMany(actor: AuthUser, itens: { nome: string; codigo?: string; ativa?: boolean | null }[]) {
    let novos = 0, atualizados = 0;
    await this.db.transaction(async tx => {
      for (const it of itens) {
        const k = nameKey(it.nome), cur = await this.repo.findByChave(k, tx);
        if (cur) {
          const codigo = it.codigo ? it.codigo : cur.codigo;
          await this.checkCodigo(tx, codigo, cur.id);
          await this.repo.update(tx, cur.id, { nome: cur.nome, chave: k, codigo, ativa: it.ativa ?? !!Number(cur.ativa) }, stamp(auditOf(cur), actor, "Importação de planilha", 15));
          atualizados++;
        } else {
          await this.checkCodigo(tx, it.codigo || null, null);
          await this.repo.insert(tx, { id: newId("f_"), nome: it.nome, chave: k, codigo: it.codigo || null, ativa: it.ativa ?? true }, stamp(null, actor, "Importação de planilha", 15));
          novos++;
        }
      }
    });
    return { novos, atualizados };
  }
  async remove(actor: AuthUser, id: string) {
    await this.db.transaction(async tx => {
      const cur = await this.repo.findById(id, tx); if (!cur) throw notFound("Filial não encontrada.");
      await this.repo.delete(tx, id);
      await auditLog(tx, actor, "filial.excluir", "filial", id, { nome: cur.nome });
    });
  }
  /** Usado pelas cotações: filial precisa estar cadastrada e ativa. Aceita nome ou código. */
  async resolveAtiva(nomeOuCodigo: string, db: Database = this.db): Promise<FilialRow | null> {
    const k = nameKey(nomeOuCodigo);
    const r = (await this.repo.findByChave(k, db)) ?? (await db.get<FilialRow>("SELECT * FROM filiais WHERE LOWER(codigo) = ?", [k]));
    return r && Number(r.ativa) ? r : null;
  }
}
