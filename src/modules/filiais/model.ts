import type { HistItem } from "../shared/audit.js";
export interface FilialRow { id: string; nome: string; nome_chave: string; codigo: string | null; ativa: number | boolean; criado_em: string; criado_por: string | null; alterado_em: string; alterado_por: string | null; historico: string }
export interface Filial { id: string; nome: string; codigo: string; ativa: boolean; criadoEm: string; criadoPor: string | null; alteradoEm: string; alteradoPor: string | null; historico: HistItem[] }
