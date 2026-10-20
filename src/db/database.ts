import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import mysql from "mysql2/promise";
import type { Env } from "../config/env.js";

export type Dialect = "sqlite" | "mysql";
export type Param = string | number | null | boolean;
export interface RunResult { changes: number; insertId: number | null }

/** Interface comum de acesso a dados. SQL sempre parametrizado com "?". */
export interface Database {
  readonly dialect: Dialect;
  query<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T | undefined>;
  run(sql: string, params?: Param[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  /** Executa fn dentro de uma transação usando a MESMA conexão; rollback em caso de erro. */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type DbConfig = Pick<Env, "DB_CLIENT" | "SQLITE_FILE" | "MYSQL_HOST" | "MYSQL_PORT" | "MYSQL_USER" | "MYSQL_PASSWORD" | "MYSQL_DATABASE" | "MYSQL_POOL_SIZE" | "MYSQL_CONNECT_TIMEOUT_MS">;

const norm = (params: Param[] = []) => params.map(p => (typeof p === "boolean" ? (p ? 1 : 0) : p));

/* ------------------------------ SQLite ------------------------------ */
class SqliteDatabase implements Database {
  readonly dialect = "sqlite" as const;
  private lock: Promise<void> = Promise.resolve();
  constructor(private readonly db: BetterSqlite3.Database, private readonly inTx = false) {}
  /** Operações fora de transação aguardam o fim da transação aberta na conexão única. */
  private async guard<T>(fn: () => T): Promise<T> {
    if (this.inTx) return fn();
    await this.lock;
    return fn();
  }
  query<T>(sql: string, params?: Param[]) { return this.guard(() => this.db.prepare(sql).all(...norm(params)) as T[]); }
  get<T>(sql: string, params?: Param[]) { return this.guard(() => this.db.prepare(sql).get(...norm(params)) as T | undefined); }
  run(sql: string, params?: Param[]) {
    return this.guard(() => { const r = this.db.prepare(sql).run(...norm(params)); return { changes: r.changes, insertId: Number(r.lastInsertRowid) || null }; });
  }
  exec(sql: string) { return this.guard(() => { this.db.exec(sql); }); }
  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    let release!: () => void;
    const prev = this.lock;
    this.lock = new Promise<void>(r => (release = r));
    await prev;
    const tx = new SqliteDatabase(this.db, true);
    this.db.exec("BEGIN IMMEDIATE");
    try { const out = await fn(tx); this.db.exec("COMMIT"); return out; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
    finally { release(); }
  }
  async close() { await this.lock; if (this.db.open) this.db.close(); }
}

/* ------------------------------ MySQL ------------------------------ */
type Queryable = mysql.Pool | mysql.PoolConnection;
class MysqlDatabase implements Database {
  readonly dialect = "mysql" as const;
  constructor(private readonly q: Queryable, private readonly pool: mysql.Pool | null) {}
  async query<T>(sql: string, params?: Param[]) { const [rows] = await this.q.query(sql, norm(params)); return rows as T[]; }
  async get<T>(sql: string, params?: Param[]) { const rows = await this.query<T>(sql, params); return rows[0]; }
  async run(sql: string, params?: Param[]) {
    const [res] = await this.q.query(sql, norm(params));
    const r = res as mysql.ResultSetHeader;
    return { changes: r.affectedRows ?? 0, insertId: r.insertId || null };
  }
  async exec(sql: string) { await this.q.query(sql); }
  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    if (!this.pool) return fn(this); // já dentro de uma transação: reutiliza a mesma conexão
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await fn(new MysqlDatabase(conn, null));
      await conn.commit();
      return out;
    } catch (e) { await conn.rollback().catch(() => {}); throw e; }
    finally { conn.release(); }
  }
  async close() { if (this.pool) await this.pool.end(); }
}

export async function createDatabase(cfg: DbConfig): Promise<Database> {
  if (cfg.DB_CLIENT === "sqlite") {
    const file = cfg.SQLITE_FILE === ":memory:" ? ":memory:" : resolve(cfg.SQLITE_FILE);
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    const db = new BetterSqlite3(file);
    if (file !== ":memory:") db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    return new SqliteDatabase(db);
  }
  const pool = mysql.createPool({
    host: cfg.MYSQL_HOST, port: cfg.MYSQL_PORT, user: cfg.MYSQL_USER, password: cfg.MYSQL_PASSWORD, database: cfg.MYSQL_DATABASE,
    connectionLimit: cfg.MYSQL_POOL_SIZE, connectTimeout: cfg.MYSQL_CONNECT_TIMEOUT_MS, charset: "utf8mb4_unicode_ci",
    waitForConnections: true, decimalNumbers: true, dateStrings: true, supportBigNumbers: true,
  });
  const c = await pool.getConnection(); await c.ping(); c.release();
  return new MysqlDatabase(pool, pool);
}
