import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/** Carrega um arquivo .env simples (CHAVE=valor) sem sobrescrever variáveis já definidas no ambiente. */
export function loadDotEnv(file = resolve(process.cwd(), ".env")): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const bool = z.enum(["true", "false", "1", "0"]).transform(v => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DB_CLIENT: z.enum(["sqlite", "mysql"]).default("sqlite"),
  SQLITE_FILE: z.string().default("./data/atlas.db"),
  MYSQL_HOST: z.string().default("127.0.0.1"),
  MYSQL_PORT: z.coerce.number().int().default(3306),
  MYSQL_USER: z.string().default("atlas"),
  MYSQL_PASSWORD: z.string().default(""),
  MYSQL_DATABASE: z.string().default("atlas"),
  MYSQL_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  MYSQL_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa ter pelo menos 32 caracteres"),
  JWT_ISSUER: z.string().default("atlas-api"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CORS_ORIGINS: z.string().default("http://localhost:3333"),
  COOKIE_SECURE: bool.default("false"),
  PUBLIC_REGISTER: bool.default("false"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).default(3 * 1024 * 1024),
  SERVE_FRONTEND: bool.default("true"),
});

export type Env = z.infer<typeof EnvSchema> & { corsOrigins: string[] };

export function readEnv(overrides: Record<string, string | undefined> = {}): Env {
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida: ${msg}`);
  }
  const corsOrigins = parsed.data.CORS_ORIGINS.split(",").map(s => s.trim()).filter(Boolean);
  if (parsed.data.NODE_ENV === "production" && parsed.data.DB_CLIENT === "mysql" && !parsed.data.MYSQL_PASSWORD) {
    throw new Error("Configuração inválida: MYSQL_PASSWORD é obrigatório em produção.");
  }
  return { ...parsed.data, corsOrigins };
}
