import { z } from "zod";
import { PaginationQuery } from "../../utils/pagination.js";
import { isValidISODate } from "../shared/dates.js";

export const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;
export const IsoDate = z.string().refine(isValidISODate, "Data inválida (use AAAA-MM-DD).");
const Url = z.string().trim().max(500).refine(v => v === "" || /^https?:\/\/[^\s]+\.[^\s]+/i.test(v), "Link de rastreio inválido.");
const ImgData = z.string().max(2_800_000, "Imagem muito grande.").refine(v => v === "" || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v), "Imagem inválida.");
const ObsKey = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const ProdutoItemSchema = z.object({
  sku: z.string().trim().min(1).max(60),
  nome: z.string().trim().max(200).optional(),
  qtd: z.number().finite().positive("Quantidade deve ser maior que zero.").max(1e7),
  valorUnit: z.number().finite().min(0).max(1e10),
  pesoUnit: z.number().finite().min(0).nullable().optional(),
});
export const OpcaoSchema = z.object({
  numero: z.string().trim().max(40).optional(),
  transportadora: z.string().trim().min(1).max(80),
  valorFrete: z.number().finite().min(0).max(1e9),
  prazoDias: z.number().int().min(1).max(365),
});
export const ObsSchema = z.object({ texto: z.string().trim().min(1).max(1000), em: z.string().max(40).optional(), autorId: z.string().max(40).nullable().optional() });

/** Campos editáveis. Campos calculados/protegidos enviados pelo cliente (valorPedido, dataPrevista, historico, criadoPor...) são ignorados e recalculados no servidor. */
const Fields = {
  cliente: z.string().trim().min(1).max(60),
  pedido: z.string().trim().min(1).max(60),
  filial: z.string().trim().min(1).max(60),
  produtos: z.array(ProdutoItemSchema).min(1, "Inclua pelo menos um produto.").max(200),
  transportadora: z.string().trim().min(1).max(80),
  valorFrete: z.number().finite().min(0).max(1e9),
  prazoDias: z.number().int().min(1).max(365),
  numeroCotacao: z.string().trim().max(40),
  opcoes: z.array(OpcaoSchema).max(20),
  opcaoSel: z.number().int().min(0).max(19),
  cep: z.string().trim().regex(/^(\d{5}-\d{3})?$/, "CEP inválido."),
  cidade: z.string().trim().min(1).max(80),
  uf: z.enum(UFS),
  dataEmbarque: IsoDate,
  rastreio: Url,
  rastreioImg: ImgData,
  rastreioImgNome: z.string().trim().max(200),
  obs: z.record(ObsKey, ObsSchema.nullable()),
  entregueEm: IsoDate.nullable(),
  acao: z.string().trim().max(80),
};
export const CotacaoBody = z.object(Fields).partial({ numeroCotacao: true, opcoes: true, opcaoSel: true, cep: true, rastreio: true, rastreioImg: true, rastreioImgNome: true, obs: true, entregueEm: true, acao: true });
export const CotacaoPatch = z.object(Fields).partial().refine(o => Object.keys(o).length > 0, "Informe ao menos um campo.");
export type CotacaoInput = z.infer<typeof CotacaoBody>;
export type CotacaoPatchInput = z.infer<typeof CotacaoPatch>;

export const PedidoIdParams = z.object({ id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) });
export const ListarPedidosQuery = PaginationQuery.extend({
  status: z.enum(["andamento", "atrasada", "entregue", "entregue_atrasado"]).optional(),
  cliente: z.string().trim().max(60).optional(),
  transportadora: z.string().trim().max(80).optional(),
  uf: z.enum(UFS).optional(),
  filial: z.string().trim().max(60).optional(),
  periodo: z.enum(["embarque", "previsao"]).default("embarque"),
  de: IsoDate.optional(),
  ate: IsoDate.optional(),
});
