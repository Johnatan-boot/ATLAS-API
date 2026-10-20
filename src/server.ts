import { loadDotEnv, readEnv } from "./config/env.js";
import { createDatabase } from "./db/database.js";
import { runMigrations } from "./db/migrate.js";
import { buildApp } from "./app.js";

loadDotEnv();
const env = readEnv();
const db = await createDatabase(env);
const applied = await runMigrations(db);
const app = await buildApp(env, db);
if (applied.length) app.log.info({ applied }, "migrations aplicadas");

let closing = false;
async function shutdown(signal: string) {
  if (closing) return; closing = true;
  app.log.info({ signal }, "encerrando a API");
  const timer = setTimeout(() => process.exit(1), 10000);
  try { await app.close(); await db.close(); } finally { clearTimeout(timer); process.exit(0); }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: env.HOST, port: env.PORT });
