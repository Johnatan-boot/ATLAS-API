import { z } from "zod";
import { Email, NomeUsuario, Senha } from "../usuarios/schema.js";

export const LoginBody = z.object({ login: z.string().trim().min(1, "Informe o e-mail ou usuário.").max(190), senha: z.string().min(1, "Informe a senha.").max(200) }).strict();
export const RegisterBody = z.object({ email: Email, usuario: NomeUsuario, senha: Senha, grupo: z.enum(["admin", "operador", "visualizador"]).optional() }).strict();
export const AlterarSenhaBody = z.object({ senhaAtual: z.string().min(1).max(200), novaSenha: Senha }).strict();
