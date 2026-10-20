import type { HistItem } from "../shared/audit.js";
export type TipoEnvio = "normal" | "flex" | "coleta";
export type StatusFlex = "faturado" | "em_rota" | "entregue";
export interface EnvioProduto { sku: string; nome: string; qtd: number; valorUnit: number; valorCatalogo: number | null; subtotal: number }
/** Contrato do frontend (Envios Marketplace). Campos não usados pelo tipo ficam vazios, como no frontend. */
export interface EnvioDoc {
  id: string; cliente: string; pedido: string; produtos: EnvioProduto[]; valorNF: number; tipo: TipoEnvio;
  dataFaturamento: string; dataLimite: string; transportadora: string; dataEntrega: string; statusFlex: StatusFlex | ""; entregueEm: string | null;
  criadoEm: string; criadoPor: string | null; alteradoEm: string; alteradoPor: string | null; atualizadoEm: string; historico: HistItem[];
}
export interface EnvioRow {
  id: string; cliente: string; pedido: string; tipo: TipoEnvio; transportadora: string; data_faturamento: string | null; data_limite: string | null; data_entrega: string | null;
  status_flex: string | null; entregue_em: string | null; valor_nf: number; dados: string; criado_em: string; criado_por: string | null; alterado_em: string; alterado_por: string | null; historico: string;
}
