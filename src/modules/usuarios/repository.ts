import type { Database, Param } from "../../db/database.js";
import { parseHist, type AuditFields } from "../shared/audit.js";
import type { Usuario, UsuarioRow } from "./model.js";
import type { Grupo } from "../../types/auth.js";

export const toUsuario = (r: UsuarioRow): Usuario => ({
  id: r.id, email: r.email, usuario: r.usuario, grupo: r.grupo, ativo: !!Number(r.ativo), ultimoAcesso: r.ultimo_acesso,
  criadoEm: r.criado_em, criadoPor: r.criado_por, alteradoEm: r.alterado_em, alteradoPor: r.alterado_por, historico: parseHist(r.historico),
});

export class UsuariosRepository {
  constructor(private readonly db: Database) {}
  findById(id: string, db: Database = this.db) { return db.get<UsuarioRow>("SELECT * FROM usuarios WHERE id = ?", [id]); }
  findByLogin(login: string) {
    const k = login.trim().toLowerCase();
    return this.db.get<UsuarioRow>("SELECT * FROM usuarios WHERE email = ? OR usuario_chave = ?", [k, k]);
  }
  findByEmail(email: string, db: Database = this.db) { return db.get<UsuarioRow>("SELECT * FROM usuarios WHERE email = ?", [email]); }
  findByUsuarioChave(k: string, db: Database = this.db) { return db.get<UsuarioRow>("SELECT * FROM usuarios WHERE usuario_chave = ?", [k]); }
  async list(f: { q?: string; grupo?: Grupo; ativo?: boolean; limit: number; offset: number }) {
    const where: string[] = []; const p: Param[] = [];
    if (f.q) { where.push("(email LIKE ? OR usuario_chave LIKE ?)"); const like = `%${f.q.toLowerCase().replace(/[%_]/g, "")}%`; p.push(like, like); }
    if (f.grupo) { where.push("grupo = ?"); p.push(f.grupo); }
    if (f.ativo !== undefined) { where.push("ativo = ?"); p.push(f.ativo ? 1 : 0); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (await this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM usuarios ${w}`, p))?.n ?? 0;
    const rows = await this.db.query<UsuarioRow>(`SELECT * FROM usuarios ${w} ORDER BY usuario_chave LIMIT ? OFFSET ?`, [...p, f.limit, f.offset]);
    return { rows, total: Number(total) };
  }
  nomes() { return this.db.query<{ id: string; usuario: string }>("SELECT id, usuario FROM usuarios ORDER BY usuario_chave"); }
  countActiveAdmins(db: Database = this.db) { return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM usuarios WHERE grupo = 'admin' AND ativo = 1").then(r => Number(r?.n ?? 0)); }
  count() { return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM usuarios").then(r => Number(r?.n ?? 0)); }
  insert(db: Database, u: { id: string; email: string; usuario: string; senhaHash: string; grupo: Grupo }, a: AuditFields) {
    return db.run(`INSERT INTO usuarios (id, email, usuario, usuario_chave, senha_hash, grupo, ativo, ultimo_acesso, criado_em, criado_por, alterado_em, alterado_por, historico)
      VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?, ?)`,
      [u.id, u.email, u.usuario, u.usuario.toLowerCase(), u.senhaHash, u.grupo, a.criadoEm, a.criadoPor, a.alteradoEm, a.alteradoPor, JSON.stringify(a.historico)]);
  }
  update(db: Database, id: string, u: { email: string; usuario: string; grupo: Grupo; ativo: boolean }, a: AuditFields) {
    return db.run(`UPDATE usuarios SET email = ?, usuario = ?, usuario_chave = ?, grupo = ?, ativo = ?, alterado_em = ?, alterado_por = ?, historico = ? WHERE id = ?`,
      [u.email, u.usuario, u.usuario.toLowerCase(), u.grupo, u.ativo ? 1 : 0, a.alteradoEm, a.alteradoPor, JSON.stringify(a.historico), id]);
  }
  setPassword(db: Database, id: string, hash: string, a: AuditFields) {
    return db.run("UPDATE usuarios SET senha_hash = ?, alterado_em = ?, alterado_por = ?, historico = ? WHERE id = ?", [hash, a.alteradoEm, a.alteradoPor, JSON.stringify(a.historico), id]);
  }
  touchLogin(id: string, at: string) { return this.db.run("UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?", [at, id]); }
  delete(db: Database, id: string) { return db.run("DELETE FROM usuarios WHERE id = ?", [id]); }
}
