export interface Filtro { de?: string; ate?: string; transportadora?: string; uf?: string; filial?: string }
export interface ResumoPedidos {
  n: number; emRota: number; entregues: number; noPrazo: number; comAtraso: number; otd: number | null; atrasadasAgora: number; maiorAtraso: number;
  atrasoMedio: number | null; valorPedidos: number; freteTotal: number; fretePct: number | null; ticketMedio: number | null; freteMedio: number | null;
}
export interface Faixa { faixa: "verde" | "atencao" | "critico" | "sem_dados"; regra: string }
