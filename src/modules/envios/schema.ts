import { z } from "zod";
import { PaginationQuery } from "../../utils/pagination.js";
import { IsoDate } from "../cotacoes/schema.js";

const Item = z.object({ sku: z.string().trim().min(1).max(60), nome: z.string().trim().max(200).optional(), qtd: z.number().finite().positive().max(1e7), valorUnit: z.number().finite().min(0).max(1e10) });
const Fields = {
  cliente: z.string().trim().min(1).max(60),
  pedido: z.string().trim().min(1).max(60),
  produtos: z.array(Item).min(1, "Inclua pelo menos um produto.").max(200),
  tipo: z.enum(["normal", "flex", "coleta"]),
  dataFaturamento: z.union([IsoDate, z.literal("")]),
  dataLimite: z.union([IsoDate, z.literal("")]),
  transportadora: z.string().trim().max(80),
  dataEntrega: z.union([IsoDate, z.literal("")]),
  statusFlex: z.enum(["faturado", "em_rota", "entregue", ""]),
  entregueEm: IsoDate.nullable(),
  acao: z.string().trim().max(80),
};
export const EnvioBody = z.object(Fields).partial({ dataFaturamento: true, dataLimite: true, transportadora: true, dataEntrega: true, statusFlex: true, entregueEm: true, acao: true });
export const EnvioPatch = z.object(Fields).partial().refine(o => Object.keys(o).length > 0, "Informe ao menos um campo.");
export type EnvioInput = z.infer<typeof EnvioBody>;
export type EnvioPatchInput = z.infer<typeof EnvioPatch>;
export const EnvioIdParams = z.object({ id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) });
export const ListarEnviosQuery = PaginationQuery.extend({
  tipo: z.enum(["normal", "flex", "coleta"]).optional(),
  status: z.enum(["andamento", "atrasada", "entregue", "entregue_atrasado"]).optional(),
  cliente: z.string().trim().max(60).optional(),
  transportadora: z.string().trim().max(80).optional(),
  de: IsoDate.optional(), ate: IsoDate.optional(),
});
