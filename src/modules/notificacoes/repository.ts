import type { Database } from "../../db/database.js";
export class NotificacoesRepository {
  constructor(private readonly db: Database) {}
  async lidas(usuarioId: string) { return new Set((await this.db.query<{ notificacao_id: string }>("SELECT notificacao_id FROM notificacao_leituras WHERE usuario_id = ?", [usuarioId])).map(r => r.notificacao_id)); }
  /** Inserção idempotente: marcar a mesma notificação duas vezes não duplica registros. */
  async marcar(usuarioId: string, ids: string[], lida: boolean, at: string) {
    await this.db.transaction(async tx => {
      for (const id of ids) {
        if (lida) { const ex = await tx.get("SELECT 1 AS x FROM notificacao_leituras WHERE usuario_id = ? AND notificacao_id = ?", [usuarioId, id]); if (!ex) await tx.run("INSERT INTO notificacao_leituras (usuario_id, notificacao_id, lida_em) VALUES (?,?,?)", [usuarioId, id, at]); }
        else await tx.run("DELETE FROM notificacao_leituras WHERE usuario_id = ? AND notificacao_id = ?", [usuarioId, id]);
      }
    });
  }
  async substituir(usuarioId: string, ids: string[], at: string) {
    await this.db.transaction(async tx => {
      await tx.run("DELETE FROM notificacao_leituras WHERE usuario_id = ?", [usuarioId]);
      for (const id of new Set(ids)) await tx.run("INSERT INTO notificacao_leituras (usuario_id, notificacao_id, lida_em) VALUES (?,?,?)", [usuarioId, id, at]);
    });
  }
}
