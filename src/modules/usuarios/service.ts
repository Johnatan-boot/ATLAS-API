import bcrypt from "bcryptjs";
import type { Database } from "../../db/database.js";
import { conflict, forbidden, notFound, unprocessable } from "../../errors/app-error.js";
import type { AuthUser, Grupo } from "../../types/auth.js";
import { newId } from "../../utils/ids.js";
import { auditLog, parseHist, stamp } from "../shared/audit.js";
import type { Usuario, UsuarioRow } from "./model.js";
import { toUsuario, UsuariosRepository } from "./repository.js";

const auditOf = (r: UsuarioRow) => ({ criadoEm: r.criado_em, criadoPor: r.criado_por, alteradoEm: r.alterado_em, alteradoPor: r.alterado_por, historico: parseHist(r.historico) });

export class UsuariosService {
  constructor(private readonly db: Database, readonly repo: UsuariosRepository, private readonly bcryptRounds: number) {}

  hash(senha: string) { return bcrypt.hash(senha, this.bcryptRounds); }

  async list(q: { q?: string; grupo?: Grupo; ativo?: boolean; page: number; pageSize: number }) {
    const { rows, total } = await this.repo.list({ ...q, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
    return { data: rows.map(toUsuario), page: q.page, pageSize: q.pageSize, total };
  }
  nomes() { return this.repo.nomes(); }
  async get(id: string): Promise<Usuario> { const r = await this.repo.findById(id); if (!r) throw notFound("Usuário não encontrado."); return toUsuario(r); }

  async create(actor: AuthUser | null, input: { email: string; usuario: string; senha: string; grupo: Grupo }, acao = "Cadastro"): Promise<Usuario> {
    const senhaHash = await this.hash(input.senha);
    const id = newId("u_");
    await this.db.transaction(async tx => {
      if (await this.repo.findByEmail(input.email, tx)) throw conflict("Este e-mail já está cadastrado.");
      if (await this.repo.findByUsuarioChave(input.usuario.toLowerCase(), tx)) throw conflict("Este usuário já existe.");
      await this.repo.insert(tx, { id, email: input.email, usuario: input.usuario, senhaHash, grupo: input.grupo }, stamp(null, actor, acao, 15));
      await auditLog(tx, actor, "usuario.criar", "usuario", id, { grupo: input.grupo });
    });
    return this.get(id);
  }

  async update(actor: AuthUser, id: string, patch: { email?: string; usuario?: string; grupo?: Grupo; ativo?: boolean }): Promise<Usuario> {
    await this.db.transaction(async tx => {
      const cur = await this.repo.findById(id, tx); if (!cur) throw notFound("Usuário não encontrado.");
      const next = { email: patch.email ?? cur.email, usuario: patch.usuario ?? cur.usuario, grupo: patch.grupo ?? cur.grupo, ativo: patch.ativo ?? !!Number(cur.ativo) };
      if (id === actor.id && (next.ativo === false || next.grupo !== "admin")) throw unprocessable("Você não pode desativar nem rebaixar o próprio acesso.");
      const wasActiveAdmin = cur.grupo === "admin" && !!Number(cur.ativo);
      if (wasActiveAdmin && (next.grupo !== "admin" || !next.ativo) && (await this.repo.countActiveAdmins(tx)) <= 1) throw unprocessable("O sistema precisa de pelo menos um administrador ativo.");
      if (next.email !== cur.email) { const o = await this.repo.findByEmail(next.email, tx); if (o && o.id !== id) throw conflict("Este e-mail já está cadastrado."); }
      if (next.usuario.toLowerCase() !== cur.usuario_chave) { const o = await this.repo.findByUsuarioChave(next.usuario.toLowerCase(), tx); if (o && o.id !== id) throw conflict("Este usuário já existe."); }
      const acao = next.grupo !== cur.grupo ? `Grupo alterado para ${next.grupo}` : next.ativo !== !!Number(cur.ativo) ? (next.ativo ? "Ativado" : "Desativado") : "Edição";
      await this.repo.update(tx, id, next, stamp(auditOf(cur), actor, acao, 15));
      if (!next.ativo) await tx.run("UPDATE refresh_tokens SET revogado_em = ? WHERE usuario_id = ? AND revogado_em IS NULL", [new Date().toISOString(), id]);
      await auditLog(tx, actor, "usuario.editar", "usuario", id, { acao });
    });
    return this.get(id);
  }

  async setPassword(actor: AuthUser, id: string, novaSenha: string, acao: string) {
    const hash = await this.hash(novaSenha);
    await this.db.transaction(async tx => {
      const cur = await this.repo.findById(id, tx); if (!cur) throw notFound("Usuário não encontrado.");
      await this.repo.setPassword(tx, id, hash, stamp(auditOf(cur), actor, acao, 15));
      // Troca de senha encerra todas as sessões de renovação daquele usuário.
      await tx.run("UPDATE refresh_tokens SET revogado_em = ? WHERE usuario_id = ? AND revogado_em IS NULL", [new Date().toISOString(), id]);
      await auditLog(tx, actor, "usuario.senha", "usuario", id, { acao });
    });
  }

  async remove(actor: AuthUser, id: string) {
    if (id === actor.id) throw unprocessable("Você não pode excluir o próprio usuário.");
    await this.db.transaction(async tx => {
      const cur = await this.repo.findById(id, tx); if (!cur) throw notFound("Usuário não encontrado.");
      if (cur.grupo === "admin" && !!Number(cur.ativo) && (await this.repo.countActiveAdmins(tx)) <= 1) throw unprocessable("Não é possível excluir o último administrador ativo.");
      await this.repo.delete(tx, id);
      await auditLog(tx, actor, "usuario.excluir", "usuario", id, { usuario: cur.usuario });
    });
  }

  ensureAdmin(actor: AuthUser) { if (actor.grupo !== "admin") throw forbidden("Somente administradores gerenciam usuários."); }
}
