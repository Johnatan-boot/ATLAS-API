/**
 * Cria o primeiro administrador de forma segura (fora da API pública).
 * Uso: ADMIN_EMAIL=... ADMIN_USUARIO=... ADMIN_SENHA=... npm run create-admin
 * A senha nunca fica gravada no código nem no repositório.
 */
import { loadDotEnv, readEnv } from "../config/env.js";
import { createDatabase } from "../db/database.js";
import { runMigrations } from "../db/migrate.js";
import { buildContext } from "../plugins/context.js";
import { CriarUsuarioBody } from "../modules/usuarios/schema.js";

loadDotEnv();
const env = readEnv();
const input = CriarUsuarioBody.parse({ email: process.env.ADMIN_EMAIL, usuario: process.env.ADMIN_USUARIO, senha: process.env.ADMIN_SENHA, grupo: "admin" });
const db = await createDatabase(env);
try {
  await runMigrations(db);
  const ctx = buildContext(env, db);
  const existentes = await ctx.usuarios.repo.countActiveAdmins();
  if (existentes > 0 && process.env.ADMIN_FORCE !== "1") {
    console.log(`Já existe ${existentes} administrador(es) ativo(s). Nada foi alterado (use ADMIN_FORCE=1 para criar outro).`);
  } else {
    const u = await ctx.usuarios.create(null, input, "Cadastro do primeiro administrador");
    console.log(`Administrador criado: ${u.usuario} <${u.email}> (id ${u.id}).`);
  }
} finally { await db.close(); }
