import { z } from "zod";
import { IsoDate } from "../cotacoes/schema.js";
import { diffDays, parseISO } from "../shared/dates.js";
export const AgendaQuery = z.object({ de: IsoDate, ate: IsoDate, cat: z.string().regex(/^(cot|prazo|coleta|normal|flex)(,(cot|prazo|coleta|normal|flex))*$/).optional() })
  .refine(q => q.de <= q.ate, "A data inicial deve ser anterior à final.")
  .refine(q => diffDays(parseISO(q.ate)!, parseISO(q.de)!) <= 400, "Intervalo máximo de 400 dias.");
