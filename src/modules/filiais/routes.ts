import type { FastifyInstance } from "fastify";
import { authorize, currentUser, requireAuth } from "../../middlewares/auth.js";
import { AtualizarFilialBody, CriarFilialBody, FilialIdParams, ListarFiliaisQuery, LoteFiliaisBody } from "./schema.js";

export async function filiaisRoutes(app: FastifyInstance) {
  const svc = app.ctx.filiais;
  app.addHook("preHandler", requireAuth());
  app.get("/", { preHandler: authorize("filiais", "ler") }, async req => {
    const q = ListarFiliaisQuery.parse(req.query);
    return svc.list({ q: q.q, ativa: q.ativa === undefined ? undefined : q.ativa === "1" || q.ativa === "true", page: q.page, pageSize: q.pageSize });
  });
  app.get("/:id", { preHandler: authorize("filiais", "ler") }, async req => ({ data: await svc.get(FilialIdParams.parse(req.params).id) }));
  app.post("/", { preHandler: authorize("filiais", "criar") }, async (req, reply) => reply.status(201).send({ data: await svc.create(currentUser(req), CriarFilialBody.parse(req.body)) }));
  app.post("/lote", { preHandler: [authorize("filiais", "criar"), authorize("filiais", "editar")] }, async req => ({ data: await svc.upsertMany(currentUser(req), LoteFiliaisBody.parse(req.body).itens) }));
  app.patch("/:id", { preHandler: authorize("filiais", "editar") }, async req => ({ data: await svc.update(currentUser(req), FilialIdParams.parse(req.params).id, AtualizarFilialBody.parse(req.body)) }));
  app.delete("/:id", { preHandler: authorize("filiais", "excluir") }, async (req, reply) => { await svc.remove(currentUser(req), FilialIdParams.parse(req.params).id); return reply.status(204).send(); });
}
