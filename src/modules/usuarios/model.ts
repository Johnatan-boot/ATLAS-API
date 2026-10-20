import type { HistItem } from "../shared/audit.js";
import type { Grupo } from "../../types/auth.js";

export interface UsuarioRow {
  id: string; email: string; usuario: string; usuario_chave: string; senha_hash: string; grupo: Grupo; ativo: number | boolean;
  ultimo_acesso: string | null; criado_em: string; criado_por: string | null; alterado_em: string; alterado_por: string | null; historico: string;
}
/** Representação pública (nunca inclui hash de senha). Campos no formato usado pelo frontend. */
export interface Usuario {
  id: string; email: string; usuario: string; grupo: Grupo; ativo: boolean; ultimoAcesso: string | null;
  criadoEm: string; criadoPor: string | null; alteradoEm: string; alteradoPor: string | null; historico: HistItem[];
}
export const GRUPOS: readonly Grupo[] = ["admin", "operador", "visualizador"] as const;
