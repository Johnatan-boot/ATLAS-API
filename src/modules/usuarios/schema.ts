import { z } from "zod";
import { PaginationQuery } from "../../utils/pagination.js";

export const Senha = z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(72, "A senha deve ter no máximo 72 caracteres.")
  .refine(s => Buffer.byteLength(s, "utf8") <= 72, "A senha excede 72 bytes.");
export const Email = z.string().trim().toLowerCase().max(190).email("E-mail inválido.");
export const NomeUsuario = z.string().trim().regex(/^[A-Za-z0-9._-]{3,40}$/, "Use de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.");
export const GrupoSchema = z.enum(["admin", "operador", "visualizador"]);

export const CriarUsuarioBody = z.object({ email: Email, usuario: NomeUsuario, senha: Senha, grupo: GrupoSchema.default("operador") }).strict();
export const AtualizarUsuarioBody = z.object({ email: Email.optional(), usuario: NomeUsuario.optional(), grupo: GrupoSchema.optional(), ativo: z.boolean().optional() })
  .strict().refine(o => Object.keys(o).length > 0, "Informe ao menos um campo.");
export const RedefinirSenhaBody = z.object({ novaSenha: Senha }).strict();
export const IdParams = z.object({ id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) });
export const ListarUsuariosQuery = PaginationQuery.extend({
  q: z.string().trim().max(100).optional(), grupo: GrupoSchema.optional(), ativo: z.enum(["1", "0", "true", "false"]).optional(),
});
