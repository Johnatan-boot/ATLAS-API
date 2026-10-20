import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "../../errors/app-error.js";
import { currentUser, requireAuth } from "../../middlewares/auth.js";
import { AlterarSenhaBody, LoginBody, RegisterBody } from "./schema.js";
import type { LoginResult } from "./model.js";

export const REFRESH_COOKIE = "atlas_rt";
const COOKIE_PATH = "/api/v1/auth";

export async function authRoutes(app: FastifyInstance) {
  const { auth, usuarios, env } = app.ctx;
  const meta = (req: FastifyRequest) => ({ ip: req.ip, ua: req.headers["user-agent"] });
  const setCookie = (reply: FastifyReply, r: LoginResult) =>
    reply.setCookie(REFRESH_COOKIE, r.refreshToken, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: "strict", path: COOKIE_PATH, expires: new Date(r.refreshExpiresAt) });
  const pub = (r: LoginResult) => ({ accessToken: r.accessToken, tokenType: "Bearer", expiresIn: r.expiresIn, usuario: r.usuario });
  /** Endpoints que usam o cookie exigem cabeçalho próprio (não enviável por formulários de outros sites) e origem permitida. */
  const csrf = async (req: FastifyRequest) => {
    if (req.headers["x-atlas-csrf"] !== "1") throw forbidden("Requisição recusada (CSRF).");
    const origin = req.headers.origin;
    if (origin && !env.corsOrigins.includes(origin)) throw forbidden("Origem não permitida.");
  };
  const authLimit = { rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: "1 minute" } };

  app.post("/login", { config: authLimit }, async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const r = await auth.login(body.login, body.senha, meta(req));
    setCookie(reply, r);
    return pub(r);
  });

  app.post("/refresh", { config: authLimit, preHandler: csrf }, async (req, reply) => {
    try {
      const r = await auth.refresh(req.cookies[REFRESH_COOKIE] ?? "", meta(req));
      setCookie(reply, r);
      return pub(r);
    } catch (e) { reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH }); throw e; }
  });

  app.post("/logout", { preHandler: csrf }, async (req, reply) => {
    await auth.logout(req.cookies[REFRESH_COOKIE]);
    reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return reply.status(204).send();
  });

  app.get("/me", { preHandler: requireAuth() }, async req => ({ usuario: currentUser(req) }));

  app.post("/senha", { preHandler: requireAuth(), config: authLimit }, async (req, reply) => {
    const body = AlterarSenhaBody.parse(req.body);
    await auth.changeOwnPassword(currentUser(req), body.senhaAtual, body.novaSenha);
    reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return reply.status(204).send();
  });

  /**
   * Cadastro. Por padrão somente administradores autenticados podem cadastrar usuários (regra do ATLAS).
   * Com PUBLIC_REGISTER=true o cadastro público é aceito, mas sempre no grupo "visualizador".
   */
  app.post("/register", { config: authLimit }, async (req, reply) => {
    const body = RegisterBody.parse(req.body);
    let actor = null;
    if (req.headers.authorization?.startsWith("Bearer ")) actor = await auth.verifyAccess(req.headers.authorization.slice(7));
    if (actor && actor.grupo === "admin") {
      const u = await usuarios.create(actor, { email: body.email, usuario: body.usuario, senha: body.senha, grupo: body.grupo ?? "operador" });
      return reply.status(201).send({ usuario: u });
    }
    if (!env.PUBLIC_REGISTER) throw actor ? forbidden("Somente administradores cadastram usuários.") : unauthorized();
    const u = await usuarios.create(null, { email: body.email, usuario: body.usuario, senha: body.senha, grupo: "visualizador" }, "Cadastro público");
    return reply.status(201).send({ usuario: u });
  });
}
