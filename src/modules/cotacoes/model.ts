import type { HistItem } from "../shared/audit.js";

/** Contrato idêntico ao frontend ATLAS (Cotações de Frete e Coletas usam a mesma estrutura). */
export interface ProdutoItem { sku: string; nome: string; qtd: number; valorUnit: number; valorCatalogo: number | null; subtotal: number; pesoUnit: number | null; pesoTotal: number | null }
export interface OpcaoFrete { numero: string; transportadora: string; valorFrete: number; prazoDias: number }
export interface Observacao { texto: string; em: string; autorId: string | null }
export interface CotacaoDoc {
  id: string;
  cliente: string; pedido: string; filial: string;
  produtos: ProdutoItem[]; valorPedido: number; pesoTotal: number;
  transportadora: string; valorFrete: number; prazoDias: number; numeroCotacao: string;
  opcoes: OpcaoFrete[]; opcaoSel: number; opcaoMelhor: number;
  cep: string; cidade: string; uf: string;
  dataEmbarque: string; dataPrevista: string;
  rastreio: string; rastreioImg: string; rastreioImgNome: string;
  obs: Record<string, Observacao>;
  entregueEm: string | null;
  criadoEm: string; criadoPor: string | null; alteradoEm: string; alteradoPor: string | null; atualizadoEm: string; historico: HistItem[];
}
export interface PedidoRow {
  id: string; cliente: string; pedido: string; filial: string; transportadora: string; cidade: string; uf: string; data_embarque: string;
  prazo_dias: number; data_prevista: string; entregue_em: string | null; valor_pedido: number; valor_frete: number; dados: string;
  criado_em: string; criado_por: string | null; alterado_em: string; alterado_por: string | null; historico: string;
}
export type StatusFiltro = "andamento" | "atrasada" | "entregue" | "entregue_atrasado";
