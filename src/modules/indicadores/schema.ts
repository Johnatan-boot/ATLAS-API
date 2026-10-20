import { z } from "zod";
import { IsoDate, UFS } from "../cotacoes/schema.js";
export const IndicadoresQuery = z.object({
  de: IsoDate.optional(), ate: IsoDate.optional(), transportadora: z.string().trim().max(80).optional(), uf: z.enum(UFS).optional(), filial: z.string().trim().max(60).optional(),
}).refine(q => !q.de || !q.ate || q.de <= q.ate, "A data inicial deve ser anterior à final.");
export const IndicadoresEnviosQuery = z.object({ de: IsoDate.optional(), ate: IsoDate.optional(), tipo: z.enum(["normal", "flex", "coleta"]).optional(), transportadora: z.string().trim().max(80).optional() })
  .refine(q => !q.de || !q.ate || q.de <= q.ate, "A data inicial deve ser anterior à final.");
export const ModuloParams = z.object({ modulo: z.enum(["cotacoes", "coletas"]) });
