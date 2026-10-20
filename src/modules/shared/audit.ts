import type { Database } from "../../db/database.js";
import type { AuthUser } from "../../types/auth.js";
import { nowISO } from "../../utils/ids.js";

export interface HistItem { em: string; por: string | null; acao: string }
export interface AuditFields { criadoEm: string; criadoPor: string | null; alteradoEm: string; alteradoPor: string | null; historico: HistItem[] }

const MAX_HIST = 50;
/** Carimbo de auditoria calculado no servidor (o cliente nunca define esses campos). */
export function stamp(prev: AuditFields | null, user: AuthUser | null, acao: string, max = MAX_HIST): AuditFields {
  const now = nowISO(), who = user?.id ?? null;
  return {
    criadoEm: prev?.criadoEm ?? now,
    criadoPor: prev ? prev.criadoPor : who,
    alteradoEm: now,
    alteradoPor: who,
    historico: [...(prev?.historico ?? []), { em: now, por: who, acao }].slice(-max),
  };
}
export const parseHist = (s: unknown): HistItem[] => { try { const v = typeof s === "string" ? JSON.parse(s) : s; return Array.isArray(v) ? v as HistItem[] : []; } catch { return []; } };

/** Trilha de auditoria de operações críticas (login, usuários, exclusões). */
export async function auditLog(db: Database, user: AuthUser | null, acao: string, entidade: string, entidadeId: string | null, detalhes?: Record<string, unknown>) {
  await db.run("INSERT INTO auditoria (em, usuario_id, acao, entidade, entidade_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)",
    [nowISO(), user?.id ?? null, acao, entidade, entidadeId, detalhes ? JSON.stringify(detalhes) : null]);
}
