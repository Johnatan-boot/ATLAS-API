/**
 * Redefine a senha de um usuário existente (esqueci a senha do administrador).
 * Uso: RESET_LOGIN=<e-mail ou usuário> RESET_SENHA=<nova senha> npm run reset-password
 * A senha nunca fica gravada no código; a troca encerra as sessões do usuário.
 */
import { loadDotEnv, readEnv } from "../config/env.js";
import { createDatabase } from "../db/database.js";
import { runMigrations } from "../db/migrate.js";
import { buildContext } from "../plugins/context.js";
import { Senha } from "../modules/usuarios/schema.js";

loadDotEnv();
const env = readEnv();
const login = (process.env.RESET_LOGIN ?? "").trim();
if (!login) { console.error("Informe RESET_LOGIN (e-mail ou usuário)."); process.exit(1); }
const senha = Senha.parse(process.env.RESET_SENHA);
const db = await createDatabase(env);
try {
  await runMigrations(db);
  const ctx = buildContext(env, db);
  const u = await ctx.usuarios.repo.findByLogin(login);
  if (!u) { console.error(`Usuário não encontrado: ${login}`); process.exitCode = 1; }
  else {
    await ctx.usuarios.setPassword({ id: u.id, usuario: u.usuario, email: u.email, grupo: u.grupo }, u.id, senha, "Senha redefinida pelo servidor");
    console.log(`Senha redefinida: ${u.usuario} <${u.email}>. Entre com o e-mail ou o usuário e a nova senha.`);
  }
} finally { await db.close(); }