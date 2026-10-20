import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Database } from "../../db/database.js";
import { unauthorized } from "../../errors/app-error.js";
import type { AuthUser, Grupo } from "../../types/auth.js";
import { newId, nowISO, randomToken, sha256 } from "../../utils/ids.js";
import { auditLog } from "../shared/audit.js";
import type { UsuariosRepository } from "../usuarios/repository.js";
import type { UsuariosService } from "../usuarios/service.js";
import type { AccessClaims, LoginResult } from "./model.js";
import { AuthRepository } from "./repository.js";

export interface AuthConfig { jwtSecret: string; issuer: string; accessTtl: number; refreshDays: number; bcryptRounds: number }
const INVALID = "E-mail/usuário ou senha inválidos.";

export class AuthService {
  /** Hash descartável comparado quando o usuário não existe, para o tempo de resposta não revelar contas cadastradas. */
  private readonly dummyHash: string;
  constructor(private readonly db: Database, private readonly repo: AuthRepository, private readonly users: UsuariosRepository, private readonly usuarios: UsuariosService, private readonly cfg: AuthConfig) {
    this.dummyHash = bcrypt.hashSync(randomToken(16), cfg.bcryptRounds);
  }

  signAccess(u: { id: string; grupo: Grupo }) {
    const claims: AccessClaims = { sub: u.id, grp: u.grupo, typ: "access" };
    return jwt.sign(claims, this.cfg.jwtSecret, { algorithm: "HS256", expiresIn: this.cfg.accessTtl, issuer: this.cfg.issuer });
  }
  /** Valida o token e recarrega o usuário do banco: o papel vem sempre do servidor. */
  async verifyAccess(token: string): Promise<AuthUser> {
    let claims: AccessClaims;
    try { claims = jwt.verify(token, this.cfg.jwtSecret, { algorithms: ["HS256"], issuer: this.cfg.issuer }) as AccessClaims; }
    catch { throw unauthorized("Sessão inválida ou expirada."); }
    if (claims.typ !== "access" || !claims.sub) throw unauthorized("Sessão inválida ou expirada.");
    const u = await this.users.findById(claims.sub);
    if (!u || !Number(u.ativo)) throw unauthorized("Sessão inválida ou expirada.");
    return { id: u.id, usuario: u.usuario, email: u.email, grupo: u.grupo };
  }

  private async issue(db: Database, u: { id: string; email: string; usuario: string; grupo: Grupo }, familia: string, meta: { ip?: string; ua?: string }) {
    const refreshToken = randomToken(), id = newId("rt_");
    const exp = new Date(Date.now() + this.cfg.refreshDays * 864e5).toISOString();
    await this.repo.insertRefresh(db, { id, usuario_id: u.id, token_hash: sha256(refreshToken), familia, expira_em: exp, criado_em: nowISO(), ip: meta.ip?.slice(0, 64) ?? null, user_agent: meta.ua?.slice(0, 255) ?? null });
    return { id, refreshToken, refreshExpiresAt: exp, accessToken: this.signAccess(u), expiresIn: this.cfg.accessTtl, usuario: { id: u.id, email: u.email, usuario: u.usuario, grupo: u.grupo } };
  }

  async login(login: string, senha: string, meta: { ip?: string; ua?: string }): Promise<LoginResult> {
    const u = await this.users.findByLogin(login);
    const ok = await bcrypt.compare(senha, u?.senha_hash ?? this.dummyHash);
    if (!u || !ok) { await auditLog(this.db, null, "auth.login_falhou", "usuario", u?.id ?? null, { ip: meta.ip }); throw unauthorized(INVALID); }
    if (!Number(u.ativo)) throw unauthorized(INVALID);
    const out = await this.db.transaction(tx => this.issue(tx, u, newId("fam_"), meta));
    await this.users.touchLogin(u.id, nowISO());
    await auditLog(this.db, { id: u.id, usuario: u.usuario, email: u.email, grupo: u.grupo }, "auth.login", "usuario", u.id, { ip: meta.ip });
    return out;
  }

  /** Rotação: cada refresh token só pode ser usado uma vez. Reuso de token já rotacionado revoga toda a família. */
  async refresh(token: string, meta: { ip?: string; ua?: string }): Promise<LoginResult> {
    const expired = () => unauthorized("Sessão expirada. Entre novamente.");
    if (!token) throw expired();
    // A transação devolve o resultado em vez de lançar erro, para que revogações por segurança sejam efetivadas (commit) mesmo quando a renovação é recusada.
    const r = await this.db.transaction(async tx => {
      const row = await this.repo.findByHash(tx, sha256(token));
      if (!row) return { ok: false as const };
      const now = nowISO();
      if (row.revogado_em) {
        if (row.substituido_por) { await this.repo.revokeFamily(tx, row.familia, now); await auditLog(tx, null, "auth.refresh_reuso", "usuario", row.usuario_id); }
        return { ok: false as const };
      }
      if (row.expira_em < now) { await this.repo.revoke(tx, row.id, now); return { ok: false as const }; }
      const u = await this.users.findById(row.usuario_id, tx);
      if (!u || !Number(u.ativo)) { await this.repo.revokeFamily(tx, row.familia, now); return { ok: false as const }; }
      const out = await this.issue(tx, u, row.familia, meta);
      await this.repo.markRotated(tx, row.id, out.id, now);
      return { ok: true as const, out };
    });
    if (!r.ok) throw expired();
    return r.out;
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.db.transaction(async tx => { const row = await this.repo.findByHash(tx, sha256(token)); if (row) await this.repo.revokeFamily(tx, row.familia, nowISO()); });
  }

  async changeOwnPassword(user: AuthUser, atual: string, nova: string) {
    const u = await this.users.findById(user.id);
    if (!u || !(await bcrypt.compare(atual, u.senha_hash))) throw unauthorized("Senha atual incorreta.");
    await this.usuarios.setPassword(user, user.id, nova, "Senha alterada pelo usuário");
  }
}
