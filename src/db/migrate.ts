import { pathToFileURL } from "node:url";
import { loadDotEnv, readEnv } from "../config/env.js";
import { createDatabase, type Database } from "./database.js";
import { migrations } from "./migrations/index.js";

/** Aplica as migrations pendentes. Seguro para executar várias vezes. */
export async function runMigrations(db: Database): Promise<string[]> {
  const ddl = db.dialect === "mysql"
    ? `CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(100) PRIMARY KEY, aplicada_em VARCHAR(30) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    : `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)`;
  await db.exec(ddl);
  const done = new Set((await db.query<{ id: string }>("SELECT id FROM schema_migrations")).map(r => r.id));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    const stmts = db.dialect === "mysql" ? m.mysql : m.sqlite;
    // SQLite: DDL transacional (tudo ou nada). MySQL: DDL faz commit implícito; o registro só é gravado ao final.
    await db.transaction(async tx => {
      for (const s of stmts) await tx.exec(s);
      await tx.run("INSERT INTO schema_migrations (id, aplicada_em) VALUES (?, ?)", [m.id, new Date().toISOString()]);
    });
    applied.push(m.id);
  }
  return applied;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  loadDotEnv();
  const env = readEnv();
  const db = await createDatabase(env);
  try {
    const applied = await runMigrations(db);
    console.log(applied.length ? `Migrations aplicadas: ${applied.join(", ")}` : "Nenhuma migration pendente.");
  } finally { await db.close(); }
}
