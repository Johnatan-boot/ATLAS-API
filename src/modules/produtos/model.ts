import type { HistItem } from "../shared/audit.js";
export interface ProdutoRow { sku_chave: string; sku: string; descricao: string; grupo: string; familia: string; fornecedor: string; valor: number; peso: number | null; criado_em: string; criado_por: string | null; alterado_em: string; alterado_por: string | null; historico: string }
export interface Produto { sku: string; descricao: string; grupo: string; familia: string; fornecedor: string; valor: number; peso: number | null; criadoEm: string; criadoPor: string | null; alteradoEm: string; alteradoPor: string | null; historico: HistItem[] }
export interface ProdutoInput { sku: string; descricao: string; grupo: string; familia: string; fornecedor: string; valor: number; peso: number | null }
