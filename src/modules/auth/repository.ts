import type { Database } from "../../db/database.js";
import type { RefreshTokenRow } from "./model.js";

export class AuthRepository {
  constructor(private readonly db: Database) {}
  insertRefresh(db: Database, r: Omit<RefreshTokenRow, "revogado_em" | "substituido_por">) {
    return db.run(`INSERT INTO refresh_tokens (id, usuario_id, token_hash, familia, expira_em, revogado_em, substituido_por, criado_em, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`, [r.id, r.usuario_id, r.token_hash, r.familia, r.expira_em, r.criado_em, r.ip, r.user_agent]);
  }
  findByHash(db: Database, hash: string) { return db.get<RefreshTokenRow>("SELECT * FROM refresh_tokens WHERE token_hash = ?", [hash]); }
  markRotated(db: Database, id: string, by: string, at: string) { return db.run("UPDATE refresh_tokens SET revogado_em = ?, substituido_por = ? WHERE id = ? AND revogado_em IS NULL", [at, by, id]); }
  revoke(db: Database, id: string, at: string) { return db.run("UPDATE refresh_tokens SET revogado_em = ? WHERE id = ? AND revogado_em IS NULL", [at, id]); }
  revokeFamily(db: Database, familia: string, at: string) { return db.run("UPDATE refresh_tokens SET revogado_em = ? WHERE familia = ? AND revogado_em IS NULL", [at, familia]); }
  purgeExpired(before: string) { return this.db.run("DELETE FROM refresh_tokens WHERE expira_em < ?", [before]); }
}
