import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./app-error.js";

/** Formato único de erro: { error: { code, message, details? } } */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError | ZodError | Error, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos.", details: err.issues.map(i => ({ path: i.path.join("."), message: i.message })) } });
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } });
    }
    const fe = err as FastifyError;
    if (fe.statusCode === 429) return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Muitas requisições. Tente novamente em instantes." } });
    if (fe.code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.status(413).send({ error: { code: "PAYLOAD_TOO_LARGE", message: "Corpo da requisição muito grande." } });
    if (typeof fe.statusCode === "number" && fe.statusCode >= 400 && fe.statusCode < 500) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Requisição inválida." } });
    }
    req.log.error({ err }, "erro inesperado");
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Erro interno. Tente novamente." } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Rota não encontrada." } }));
}
