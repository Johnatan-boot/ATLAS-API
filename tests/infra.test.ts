import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../src/db/migrate.js";
import { setup, type TestCtx } from "./helpers.js";

let t: TestCtx;
before(async () => { t = await setup(); });
after(async () => t.close());

test("API inicia e o health check consulta o banco", async () => {
  const r = await t.app.inject({ url: "/api/v1/health" });
  assert.equal(r.statusCode, 200); assert.equal(r.json().status, "ok"); assert.equal(r.json().banco, t.db.dialect);
});
test("migrations são reproduzíveis e não reaplicam", async () => {
  assert.deepEqual(await runMigrations(t.db), []);
  const m = await t.db.query<{ id: string }>("SELECT id FROM schema_migrations");
  assert.deepEqual(m.map(x => x.id), ["001_init"]);
});
test("integridade referencial: token de sessão exige usuário existente", async () => {
  await assert.rejects(t.db.run("INSERT INTO refresh_tokens (id, usuario_id, token_hash, familia, expira_em, criado_em) VALUES ('r1','nao-existe','h','f','x','x')"));
});
test("cabeçalhos de segurança, erro padronizado e rota inexistente", async () => {
  const r = await t.app.inject({ url: "/api/v1/health" });
  assert.ok(r.headers["x-content-type-options"]); assert.ok(r.headers["content-security-policy"]);
  const nf = await t.app.inject({ url: "/api/v1/nao-existe" });
  assert.equal(nf.statusCode, 404); assert.equal(nf.json().error.code, "NOT_FOUND");
  const bad = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "content-type": "application/json" }, payload: "{quebrado" });
  assert.equal(bad.statusCode, 400); assert.ok(bad.json().error);
});
test("CORS só libera origens da allowlist", async () => {
  const ok = await t.app.inject({ method: "OPTIONS", url: "/api/v1/health", headers: { origin: "http://localhost:3333", "access-control-request-method": "GET" } });
  assert.equal(ok.headers["access-control-allow-origin"], "http://localhost:3333");
  const no = await t.app.inject({ method: "OPTIONS", url: "/api/v1/health", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
  assert.notEqual(no.headers["access-control-allow-origin"], "https://evil.example");
});
test("limite de tamanho do corpo", async () => {
  const t2 = await setup({ BODY_LIMIT_BYTES: "2048" });
  try {
    const r = await t2.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { login: "x".repeat(5000), senha: "y" } });
    assert.equal(r.statusCode, 413);
  } finally { await t2.close(); }
});
