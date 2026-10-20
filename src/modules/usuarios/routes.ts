import type { FastifyInstance } from "fastify";
import { authorize, currentUser, requireAuth } from "../../middlewares/auth.js";
import { AtualizarUsuarioBody, CriarUsuarioBody, IdParams, ListarUsuariosQuery, RedefinirSenhaBody } from "./schema.js";

export async function usuariosRoutes(app: FastifyInstance) {
  const svc = app.ctx.usuarios;
  app.addHook("preHandler", requireAuth());

  /** Nomes para exibir autores no histórico (qualquer usuário autenticado; sem e-mail nem grupo). */
  app.get("/nomes", async () => ({ data: await svc.nomes() }));

  app.get("/", { preHandler: authorize("usuarios", "ler") }, async req => {
    const q = ListarUsuariosQuery.parse(req.query);
    return svc.list({ q: q.q, grupo: q.grupo, ativo: q.ativo === undefined ? undefined : q.ativo === "1" || q.ativo === "true", page: q.page, pageSize: q.pageSize });
  });
  app.get("/:id", { preHandler: authorize("usuarios", "ler") }, async req => ({ data: await svc.get(IdParams.parse(req.params).id) }));
  app.post("/", { preHandler: authorize("usuarios", "criar") }, async (req, reply) => {
    const body = CriarUsuarioBody.parse(req.body);
    return reply.status(201).send({ data: await svc.create(currentUser(req), body) });
  });
  app.patch("/:id", { preHandler: authorize("usuarios", "editar") }, async req => {
    const { id } = IdParams.parse(req.params);
    return { data: await svc.update(currentUser(req), id, AtualizarUsuarioBody.parse(req.body)) };
  });
  app.post("/:id/senha", { preHandler: authorize("usuarios", "editar") }, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await svc.setPassword(currentUser(req), id, RedefinirSenhaBody.parse(req.body).novaSenha, "Senha redefinida");
    return reply.status(204).send();
  });
  app.delete("/:id", { preHandler: authorize("usuarios", "excluir") }, async (req, reply) => {
    await svc.remove(currentUser(req), IdParams.parse(req.params).id);
    return reply.status(204).send();
  });
}
