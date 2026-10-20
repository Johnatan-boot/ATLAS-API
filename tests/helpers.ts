import { readEnv, type Env } from "../src/config/env.js";
import { createDatabase, type Database } from "../src/db/database.js";
import { runMigrations } from "../src/db/migrate.js";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";
import type { Grupo } from "../src/types/auth.js";

export const isMysql = process.env.DB_CLIENT === "mysql";

export async function resetMysql(db: Database) {
  const rows = await db.query<{ t: string }>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()");
  await db.exec("SET FOREIGN_KEY_CHECKS = 0");
  for (const r of rows) await db.exec(`DROP TABLE IF EXISTS \`${r.t}\``);
  await db.exec("SET FOREIGN_KEY_CHECKS = 1");
}

export interface TestCtx { app: FastifyInstance; db: Database; env: Env; close: () => Promise<void> }
export async function setup(over: Record<string, string> = {}): Promise<TestCtx> {
  const env = readEnv({
    NODE_ENV: "test", LOG_LEVEL: "silent", JWT_SECRET: "segredo-de-teste-com-mais-de-32-caracteres!!", BCRYPT_ROUNDS: "4",
    DB_CLIENT: isMysql ? "mysql" : "sqlite", SQLITE_FILE: ":memory:", SERVE_FRONTEND: "false", CORS_ORIGINS: "http://localhost:3333",
    RATE_LIMIT_MAX: "100000", AUTH_RATE_LIMIT_MAX: "100000", ...over,
  });
  const db = await createDatabase(env);
  if (isMysql) await resetMysql(db);
  await runMigrations(db);
  const app = await buildApp(env, db);
  await app.ready();
  return { app, db, env, close: async () => { await app.close(); await db.close(); } };
}

export async function createUser(t: TestCtx, usuario: string, grupo: Grupo, senha = "Senha@12345") {
  return t.app.ctx.usuarios.create(null, { email: `${usuario.toLowerCase()}@kingstar.test`, usuario, senha, grupo });
}
export async function login(t: TestCtx, loginId: string, senha = "Senha@12345") {
  const r = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { login: loginId, senha } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.statusCode} ${r.body}`);
  const cookie = (r.headers["set-cookie"] as string | string[] | undefined);
  const raw = Array.isArray(cookie) ? cookie[0]! : cookie!;
  return { token: r.json().accessToken as string, refresh: raw.split(";")[0]!.split("=")[1]!, usuario: r.json().usuario };
}
export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Usuários padrão dos três grupos. */
export async function seedUsers(t: TestCtx) {
  await createUser(t, "Admin.T", "admin"); await createUser(t, "Oper.T", "operador"); await createUser(t, "Visu.T", "visualizador");
  return { admin: (await login(t, "Admin.T")).token, oper: (await login(t, "Oper.T")).token, visu: (await login(t, "Visu.T")).token };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoOffset = (days: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export async function seedCadastros(t: TestCtx, token: string) {
  await t.app.inject({ method: "POST", url: "/api/v1/filiais", headers: auth(token), payload: { nome: "São Paulo", codigo: "SP01" } });
  await t.app.inject({ method: "POST", url: "/api/v1/filiais", headers: auth(token), payload: { nome: "Campinas", codigo: "CPS", ativa: false } });
  await t.app.inject({ method: "PUT", url: "/api/v1/produtos/CMP078", headers: auth(token), payload: { descricao: "CMP MASTER KING GOLD", valor: 508.69, peso: 32.5 } });
  await t.app.inject({ method: "PUT", url: "/api/v1/produtos/BOX138", headers: auth(token), payload: { descricao: "BOX BAÚ 138", valor: 612.4, peso: null } });
}
export const cotacaoPayload = (over: Record<string, unknown> = {}) => ({
  cliente: "10245", pedido: "PV-1", filial: "sp01",
  produtos: [{ sku: "CMP078", qtd: 2, valorUnit: 508.69 }, { sku: "BOX138", qtd: 1, valorUnit: 600 }],
  transportadora: "X", valorFrete: 0, prazoDias: 1,
  opcoes: [{ numero: "A1", transportadora: "Braspress", valorFrete: 612, prazoDias: 6 }, { numero: "J1", transportadora: "Jamef", valorFrete: 548.9, prazoDias: 7 }, { numero: "T1", transportadora: "TNT", valorFrete: 548.9, prazoDias: 4 }],
  cep: "50010-000", cidade: "Recife", uf: "PE", dataEmbarque: isoOffset(0), rastreio: "", ...over,
});
