import type { FastifyInstance } from "fastify";
import { authorize, currentUser, requireAuth } from "../../middlewares/auth.js";
import type { CategoriaAgenda } from "./model.js";
import { AgendaQuery } from "./schema.js";

export async function agendaRoutes(app: FastifyInstance) {
  const svc = app.ctx.agenda;
  app.addHook("preHandler", requireAuth());
  app.addHook("preHandler", authorize("agenda", "ler"));
  app.get("/", async req => {
    const q = AgendaQuery.parse(req.query);
    return { data: await svc.eventos(currentUser(req), q.de, q.ate, q.cat ? (q.cat.split(",") as CategoriaAgenda[]) : undefined) };
  });
}
