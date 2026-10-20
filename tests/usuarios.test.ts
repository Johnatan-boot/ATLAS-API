import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { auth, login, seedUsers, setup, type TestCtx } from "./helpers.js";

let t: TestCtx; let tk: { admin: string; oper: string; visu: string };
before(async () => { t = await setup(); tk = await seedUsers(t); });
after(async () => t.close());

test("somente admin lista usuários; resposta nunca expõe hash", async () => {
  assert.equal((await t.app.inject({ url: "/api/v1/usuarios", headers: auth(tk.oper) })).statusCode, 403);
  assert.equal((await t.app.inject({ url: "/api/v1/usuarios", headers: auth(tk.visu) })).statusCode, 403);
  const r = await t.app.inject({ url: "/api/v1/usuarios?pageSize=2&page=1", headers: auth(tk.admin) });
  assert.equal(r.statusCode, 200); assert.equal(r.json().data.length, 2); assert.equal(r.json().total, 3);
  assert.ok(!JSON.stringify(r.json()).includes("senha"));
});
test("qualquer autenticado consulta apenas os nomes (para o histórico)", async () => {
  const r = await t.app.inject({ url: "/api/v1/usuarios/nomes", headers: auth(tk.visu) });
  assert.equal(r.statusCode, 200); assert.deepEqual(Object.keys(r.json().data[0]).sort(), ["id", "usuario"]);
});
test("criar, conflito de unicidade e validação", async () => {
  const ok = await t.app.inject({ method: "POST", url: "/api/v1/usuarios", headers: auth(tk.admin), payload: { email: "n1@kingstar.test", usuario: "Novo.Um", senha: "Senha@12345", grupo: "operador" } });
  assert.equal(ok.statusCode, 201); assert.equal(ok.json().data.historico[0].acao, "Cadastro");
  const dupEmail = await t.app.inject({ method: "POST", url: "/api/v1/usuarios", headers: auth(tk.admin), payload: { email: "N1@kingstar.test", usuario: "Outro", senha: "Senha@12345" } });
  assert.equal(dupEmail.statusCode, 409);
  const dupUser = await t.app.inject({ method: "POST", url: "/api/v1/usuarios", headers: auth(tk.admin), payload: { email: "n2@kingstar.test", usuario: "novo.um", senha: "Senha@12345" } });
  assert.equal(dupUser.statusCode, 409);
  const bad = await t.app.inject({ method: "POST", url: "/api/v1/usuarios", headers: auth(tk.admin), payload: { email: "x", usuario: "a b", senha: "123" } });
  assert.equal(bad.statusCode, 400);
  const extra = await t.app.inject({ method: "POST", url: "/api/v1/usuarios", headers: auth(tk.admin), payload: { email: "n3@kingstar.test", usuario: "Tres", senha: "Senha@12345", senha_hash: "x" } });
  assert.equal(extra.statusCode, 400, "campos protegidos são rejeitados");
});
test("proteções do último administrador e do próprio acesso", async () => {
  const me = (await t.app.inject({ url: "/api/v1/auth/me", headers: auth(tk.admin) })).json().usuario;
  assert.equal((await t.app.inject({ method: "DELETE", url: `/api/v1/usuarios/${me.id}`, headers: auth(tk.admin) })).statusCode, 422);
  assert.equal((await t.app.inject({ method: "PATCH", url: `/api/v1/usuarios/${me.id}`, headers: auth(tk.admin), payload: { grupo: "operador" } })).statusCode, 422);
});
test("trocar grupo, redefinir senha e excluir", async () => {
  const c = await t.app.inject({ method: "POST", url: "/api/v1/usuarios", headers: auth(tk.admin), payload: { email: "g@kingstar.test", usuario: "Grupo.Troca", senha: "Senha@12345", grupo: "visualizador" } });
  const id = c.json().data.id;
  const p = await t.app.inject({ method: "PATCH", url: `/api/v1/usuarios/${id}`, headers: auth(tk.admin), payload: { grupo: "operador" } });
  assert.equal(p.json().data.grupo, "operador"); assert.match(p.json().data.historico.at(-1).acao, /Grupo alterado/);
  assert.equal((await t.app.inject({ method: "POST", url: `/api/v1/usuarios/${id}/senha`, headers: auth(tk.oper), payload: { novaSenha: "Outra@1234" } })).statusCode, 403);
  assert.equal((await t.app.inject({ method: "POST", url: `/api/v1/usuarios/${id}/senha`, headers: auth(tk.admin), payload: { novaSenha: "Outra@1234" } })).statusCode, 204);
  await login(t, "Grupo.Troca", "Outra@1234");
  assert.equal((await t.app.inject({ method: "DELETE", url: `/api/v1/usuarios/${id}`, headers: auth(tk.oper) })).statusCode, 403);
  assert.equal((await t.app.inject({ method: "DELETE", url: `/api/v1/usuarios/${id}`, headers: auth(tk.admin) })).statusCode, 204);
  assert.equal((await t.app.inject({ url: `/api/v1/usuarios/${id}`, headers: auth(tk.admin) })).statusCode, 404);
});
test("exclusões ficam na trilha de auditoria", async () => {
  const n = await t.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'usuario.excluir'");
  assert.ok(Number(n!.n) >= 1);
});
