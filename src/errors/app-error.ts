/** Erro de aplicação com status HTTP e código estável para o cliente. */
export class AppError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "AppError";
  }
}
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "BAD_REQUEST", msg, details);
export const unauthorized = (msg = "Não autenticado.") => new AppError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "Sem permissão para esta operação.") => new AppError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Recurso não encontrado.") => new AppError(404, "NOT_FOUND", msg);
export const conflict = (msg: string, details?: unknown) => new AppError(409, "CONFLICT", msg, details);
export const unprocessable = (msg: string, details?: unknown) => new AppError(422, "BUSINESS_RULE", msg, details);
