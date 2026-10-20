import type { FastifyInstance } from "fastify";
import { authorize, can, currentUser, requireAuth } from "../../middlewares/auth.js";
import type { ModuloNotif } from "./model.js";
import { LeiturasBody, ListarNotificacoesQuery, MarcarLidasBody } from "./schema.js";

export async function notificacoesRoutes(app: FastifyInstance) {
  const svc = app.ctx.notificacoes;
  app.addHook("preHandler", requireAuth());
  app.addHook("preHandler", authorize("notificacoes", "ler"));
  app.get("/", async req => {
    const u = currentUser(req), q = ListarNotificacoesQuery.parse(req.query);
    const mods = (["cot", "col", "env"] as ModuloNotif[]).filter(m => can(u, m === "cot" ? "cotacoes" : m === "col" ? "coletas" : "envios", "ler"));
    return svc.list(u.id, mods, { mod: q.mod, type: q.type, somenteNaoLidas: q.somenteNaoLidas === "1" || q.somenteNaoLidas === "true", limit: q.limit });
  });
  app.post("/lidas", { preHandler: authorize("notificacoes", "editar") }, async (req, reply) => { const b = MarcarLidasBody.parse(req.body); await svc.marcar(currentUser(req).id, b.ids, b.lida); return reply.status(204).send(); });
  app.get("/leituras", async req => svc.leituras(currentUser(req).id));
  app.put("/leituras", { preHandler: authorize("notificacoes", "editar") }, async (req, reply) => { await svc.salvarLeituras(currentUser(req).id, LeiturasBody.parse(req.body).lidas); return reply.status(204).send(); });
}
