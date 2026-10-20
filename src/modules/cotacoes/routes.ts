import type { FastifyInstance } from "fastify";
import { authorize, currentUser, requireAuth, type Recurso } from "../../middlewares/auth.js";
import type { PedidosService } from "./service.js";
import { CotacaoBody, CotacaoPatch, ListarPedidosQuery, PedidoIdParams } from "./schema.js";

/** Rotas compartilhadas por Cotações de Frete e Coletas (mesma estrutura no frontend, bases separadas). */
export function pedidosRoutes(recurso: Extract<Recurso, "cotacoes" | "coletas">, pick: (app: FastifyInstance) => PedidosService) {
  return async (app: FastifyInstance) => {
    const svc = pick(app);
    app.addHook("preHandler", requireAuth());
    app.get("/", { preHandler: authorize(recurso, "ler") }, async req => svc.list(ListarPedidosQuery.parse(req.query)));
    app.get("/:id", { preHandler: authorize(recurso, "ler") }, async req => ({ data: await svc.get(PedidoIdParams.parse(req.params).id) }));
    app.post("/", { preHandler: authorize(recurso, "criar") }, async (req, reply) => reply.status(201).send({ data: await svc.create(currentUser(req), CotacaoBody.parse(req.body)) }));
    app.put("/:id", { preHandler: authorize(recurso, "editar") }, async req => ({ data: await svc.replace(currentUser(req), PedidoIdParams.parse(req.params).id, CotacaoBody.parse(req.body)) }));
    app.patch("/:id", { preHandler: authorize(recurso, "editar") }, async req => ({ data: await svc.patch(currentUser(req), PedidoIdParams.parse(req.params).id, CotacaoPatch.parse(req.body)) }));
    app.delete("/:id", { preHandler: authorize(recurso, "excluir") }, async (req, reply) => { await svc.remove(currentUser(req), PedidoIdParams.parse(req.params).id); return reply.status(204).send(); });
  };
}
export const cotacoesRoutes = pedidosRoutes("cotacoes", app => app.ctx.cotacoes);
