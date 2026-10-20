import type { FastifyInstance } from "fastify";
import { authorize, requireAuth } from "../../middlewares/auth.js";
import { IndicadoresEnviosQuery, IndicadoresQuery, ModuloParams } from "./schema.js";

export async function indicadoresRoutes(app: FastifyInstance) {
  const svc = app.ctx.indicadores;
  app.addHook("preHandler", requireAuth());
  app.addHook("preHandler", authorize("indicadores", "ler"));
  app.get("/envios", async req => ({ data: await svc.envios(IndicadoresEnviosQuery.parse(req.query)) }));
  app.get("/:modulo", async req => ({ data: await svc.pedidos(ModuloParams.parse(req.params).modulo, IndicadoresQuery.parse(req.query)) }));
}
