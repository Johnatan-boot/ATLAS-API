import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "../errors/app-error.js";
import type { Acao, AuthUser, Grupo } from "../types/auth.js";

export type Recurso = "cotacoes" | "coletas" | "envios" | "produtos" | "filiais" | "notificacoes" | "indicadores" | "agenda" | "usuarios";

/**
 * Matriz de permissões do ATLAS (definida pelo negócio):
 * - Visualizador: somente leitura de Acompanhar cotações e Acompanhar envios.
 * - Operador: todas as telas operacionais; inclui e edita, mas não exclui; sem Usuários e Permissões.
 * - Administrador: acesso total.
 */
const MATRIZ: Record<Grupo, Partial<Record<Recurso, Acao[]>>> = {
  visualizador: { cotacoes: ["ler"], envios: ["ler"] },
  operador: {
    cotacoes: ["ler", "criar", "editar"], coletas: ["ler", "criar", "editar"], envios: ["ler", "criar", "editar"],
    produtos: ["ler", "criar", "editar"], filiais: ["ler", "criar", "editar"], notificacoes: ["ler", "editar"],
    indicadores: ["ler"], agenda: ["ler"],
  },
  admin: {
    cotacoes: ["ler", "criar", "editar", "excluir"], coletas: ["ler", "criar", "editar", "excluir"], envios: ["ler", "criar", "editar", "excluir"],
    produtos: ["ler", "criar", "editar", "excluir"], filiais: ["ler", "criar", "editar", "excluir"], notificacoes: ["ler", "editar"],
    indicadores: ["ler"], agenda: ["ler"], usuarios: ["ler", "criar", "editar", "excluir"],
  },
};
export const can = (u: AuthUser, r: Recurso, a: Acao) => (MATRIZ[u.grupo]?.[r] ?? []).includes(a);

declare module "fastify" { interface FastifyRequest { user?: AuthUser } }

export function requireAuth() {
  return async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) throw unauthorized();
    req.user = await req.server.ctx.auth.verifyAccess(h.slice(7).trim());
  };
}
export function authorize(recurso: Recurso, acao: Acao) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.user) throw unauthorized();
    if (!can(req.user, recurso, acao)) throw forbidden();
  };
}
export const currentUser = (req: FastifyRequest): AuthUser => { if (!req.user) throw unauthorized(); return req.user; };
