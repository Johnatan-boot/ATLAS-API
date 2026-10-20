import { z } from "zod";
import { PaginationQuery } from "../../utils/pagination.js";
export const Sku = z.string().trim().min(1, "Informe o SKU.").max(60).regex(/^[^\s/\\?#%]+$/, "SKU não pode conter espaços nem / \\ ? # %.");
export const ProdutoBody = z.object({
  sku: Sku.optional(),
  descricao: z.string().trim().min(1, "Informe a descrição.").max(200),
  grupo: z.string().trim().max(80).default(""),
  familia: z.string().trim().max(80).default(""),
  fornecedor: z.string().trim().max(120).default(""),
  valor: z.number().finite().min(0).max(1e10),
  peso: z.number().finite().min(0).max(1e7).nullable().default(null),
  acao: z.string().trim().max(80).optional(),
});
export const LoteProdutosBody = z.object({ itens: z.array(ProdutoBody.extend({ sku: Sku })).min(1).max(5000), acao: z.string().trim().max(80).optional() }).strict();
export const SkuParams = z.object({ sku: Sku });
export const ListarProdutosQuery = PaginationQuery.extend({ q: z.string().trim().max(100).optional(), grupo: z.string().max(80).optional(), familia: z.string().max(80).optional(), fornecedor: z.string().max(120).optional() });
