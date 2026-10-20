import type { FastifyInstance } from "fastify";
import { authorize, currentUser, requireAuth } from "../../middlewares/auth.js";
import { ListarProdutosQuery, LoteProdutosBody, ProdutoBody, SkuParams } from "./schema.js";

export async function produtosRoutes(app: FastifyInstance) {
  const svc = app.ctx.produtos;
  app.addHook("preHandler", requireAuth());
  app.get("/", { preHandler: authorize("produtos", "ler") }, async req => svc.list(ListarProdutosQuery.parse(req.query)));
  app.get("/:sku", { preHandler: authorize("produtos", "ler") }, async req => ({ data: await svc.get(SkuParams.parse(req.params).sku) }));
  /** Cria ou atualiza pelo SKU (idempotente). */
  app.put("/:sku", { preHandler: [authorize("produtos", "criar"), authorize("produtos", "editar")] }, async (req, reply) => {
    const { sku } = SkuParams.parse(req.params);
    const r = await svc.upsert(currentUser(req), sku, ProdutoBody.parse(req.body));
    return reply.status(r.resultado === "novo" ? 201 : 200).send({ data: r.data });
  });
  app.post("/lote", { preHandler: [authorize("produtos", "criar"), authorize("produtos", "editar")] }, async req => {
    const b = LoteProdutosBody.parse(req.body);
    return { data: await svc.upsertMany(currentUser(req), b.itens, b.acao) };
  });
  app.delete("/:sku", { preHandler: authorize("produtos", "excluir") }, async (req, reply) => { await svc.remove(currentUser(req), SkuParams.parse(req.params).sku); return reply.status(204).send(); });
}
