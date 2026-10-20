import { z } from "zod";
const NotifId = z.string().regex(/^[A-Za-z0-9_:.-]{1,120}$/);
export const ListarNotificacoesQuery = z.object({
  mod: z.enum(["cot", "col", "env"]).optional(), type: z.enum(["prazo", "atraso"]).optional(),
  somenteNaoLidas: z.enum(["1", "0", "true", "false"]).optional(), limit: z.coerce.number().int().min(1).max(2000).default(500),
});
export const MarcarLidasBody = z.object({ ids: z.array(NotifId).min(1).max(5000), lida: z.boolean().default(true) }).strict();
/** Formato compatível com o documento de leitura usado pelo frontend ({ lidas: { [id]: true } }). */
export const LeiturasBody = z.object({ lidas: z.record(NotifId, z.boolean()) }).strict();
