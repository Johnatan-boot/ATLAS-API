import { z } from "zod";
import { PaginationQuery } from "../../utils/pagination.js";
const Nome = z.string().trim().min(1, "Informe o nome da filial.").max(60).transform(s => s.replace(/\s+/g, " "));
const Codigo = z.string().trim().max(20).default("");
export const CriarFilialBody = z.object({ nome: Nome, codigo: Codigo, ativa: z.boolean().default(true) }).strict();
export const AtualizarFilialBody = z.object({ nome: Nome.optional(), codigo: z.string().trim().max(20).optional(), ativa: z.boolean().optional() }).strict()
  .refine(o => Object.keys(o).length > 0, "Informe ao menos um campo.");
export const LoteFiliaisBody = z.object({ itens: z.array(z.object({ nome: Nome, codigo: z.string().trim().max(20).optional(), ativa: z.boolean().nullable().optional() }).strict()).min(1).max(1000) }).strict();
export const FilialIdParams = z.object({ id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/) });
export const ListarFiliaisQuery = PaginationQuery.extend({ q: z.string().trim().max(60).optional(), ativa: z.enum(["1", "0", "true", "false"]).optional() });
