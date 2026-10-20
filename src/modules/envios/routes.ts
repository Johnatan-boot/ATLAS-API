import type { FastifyInstance } from "fastify";
import { authorize, currentUser, requireAuth } from "../../middlewares/auth.js";
import { EnvioBody, EnvioIdParams, EnvioPatch, ListarEnviosQuery } from "./schema.js";

export async function enviosRoutes(app: FastifyInstance) {
  const svc = app.ctx.envios;
  app.addHook("preHandler", requireAuth());
  app.get("/", { preHandler: authorize("envios", "ler") }, async req => svc.list(ListarEnviosQuery.parse(req.query)));
  app.get("/:id", { preHandler: authorize("envios", "ler") }, async req => ({ data: await svc.get(EnvioIdParams.parse(req.params).id) }));
  app.post("/", { preHandler: authorize("envios", "criar") }, async (req, reply) => reply.status(201).send({ data: await svc.create(currentUser(req), EnvioBody.parse(req.body)) }));
  app.put("/:id", { preHandler: authorize("envios", "editar") }, async req => ({ data: await svc.replace(currentUser(req), EnvioIdParams.parse(req.params).id, EnvioBody.parse(req.body)) }));
  app.patch("/:id", { preHandler: authorize("envios", "editar") }, async req => ({ data: await svc.patch(currentUser(req), EnvioIdParams.parse(req.params).id, EnvioPatch.parse(req.body)) }));
  app.delete("/:id", { preHandler: authorize("envios", "excluir") }, async (req, reply) => { await svc.remove(currentUser(req), EnvioIdParams.parse(req.params).id); return reply.status(204).send(); });
}
