import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { Env } from "./config/env.js";
import type { Database } from "./db/database.js";
import { registerErrorHandler } from "./errors/handler.js";
import { buildContext } from "./plugins/context.js";
import { agendaRoutes } from "./modules/agenda/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { coletasRoutes } from "./modules/coletas/routes.js";
import { cotacoesRoutes } from "./modules/cotacoes/routes.js";
import { enviosRoutes } from "./modules/envios/routes.js";
import { filiaisRoutes } from "./modules/filiais/routes.js";
import { indicadoresRoutes } from "./modules/indicadores/routes.js";
import { notificacoesRoutes } from "./modules/notificacoes/routes.js";
import { produtosRoutes } from "./modules/produtos/routes.js";
import { usuariosRoutes } from "./modules/usuarios/routes.js";

export async function buildApp(env: Env, db: Database): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: env.BODY_LIMIT_BYTES,
    trustProxy: env.NODE_ENV === "production",
    logger: env.LOG_LEVEL === "silent" ? false : {
      level: env.LOG_LEVEL,
      // Redação de credenciais e tokens nos logs.
      redact: { paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]', "body.senha", "body.novaSenha", "body.senhaAtual", "*.password", "*.token"], censor: "[REDACTED]" },
    },
  });
  app.decorate("ctx", buildContext(env, db));
  registerErrorHandler(app);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // O frontend ATLAS é um arquivo único com scripts/estilos inline; SheetJS vem do cdnjs.
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
        upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, { origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)), credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], allowedHeaders: ["Content-Type", "Authorization", "X-Atlas-Csrf"] });
  await app.register(rateLimit, { global: true, max: env.RATE_LIMIT_MAX, timeWindow: "1 minute" });
  await app.register(cookie);

  app.get("/api/v1/health", { config: { rateLimit: false } }, async () => {
    await db.get("SELECT 1 AS ok");
    return { status: "ok", banco: db.dialect, versao: "1.0.0" };
  });
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(usuariosRoutes, { prefix: "/api/v1/usuarios" });
  await app.register(filiaisRoutes, { prefix: "/api/v1/filiais" });
  await app.register(produtosRoutes, { prefix: "/api/v1/produtos" });
  await app.register(cotacoesRoutes, { prefix: "/api/v1/cotacoes" });
  await app.register(coletasRoutes, { prefix: "/api/v1/coletas" });
  await app.register(enviosRoutes, { prefix: "/api/v1/envios" });
  await app.register(notificacoesRoutes, { prefix: "/api/v1/notificacoes" });
  await app.register(indicadoresRoutes, { prefix: "/api/v1/indicadores" });
  await app.register(agendaRoutes, { prefix: "/api/v1/agenda" });

  const pub = resolve(process.cwd(), "public");
  if (env.SERVE_FRONTEND && existsSync(resolve(pub, "index.html"))) {
    await app.register(fastifyStatic, { root: pub, prefix: "/", index: ["index.html"], cacheControl: false });
  }
  return app;
}
