import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { auth, seedUsers, setup, type TestCtx } from "./helpers.js";

let t: TestCtx; let tk: { admin: string; oper: string; visu: string };
before(async () => { t = await setup(); tk = await seedUsers(t); });
after(async () => t.close());

test("produtos: upsert idempotente, busca, filtros e exclusão somente admin", async () => {
  const c = await t.app.inject({ method: "PUT", url: "/api/v1/produtos/trav50", headers: auth(tk.oper), payload: { descricao: "Travesseiro", grupo: "Acessórios", valor: 59.9, peso: 0.9 } });
  assert.equal(c.statusCode, 201); assert.equal(c.json().data.sku, "trav50");
  const u = await t.app.inject({ method: "PUT", url: "/api/v1/produtos/TRAV50", headers: auth(tk.oper), payload: { descricao: "Travesseiro Soft", grupo: "Acessórios", valor: 61.123, peso: null } });
  assert.equal(u.statusCode, 200); assert.equal(u.json().data.valor, 61.12); assert.equal(u.json().data.historico.at(-1).acao, "Edição");
  const l = await t.app.inject({ url: "/api/v1/produtos?q=soft&grupo=Acess%C3%B3rios", headers: auth(tk.oper) });
  assert.equal(l.json().total, 1);
  assert.equal((await t.app.inject({ url: "/api/v1/produtos", headers: auth(tk.visu) })).statusCode, 403);
  assert.equal((await t.app.inject({ method: "PUT", url: "/api/v1/produtos/X1", headers: auth(tk.oper), payload: { descricao: "", valor: -1 } })).statusCode, 400);
  assert.equal((await t.app.inject({ method: "DELETE", url: "/api/v1/produtos/TRAV50", headers: auth(tk.oper) })).statusCode, 403);
  assert.equal((await t.app.inject({ method: "DELETE", url: "/api/v1/produtos/TRAV50", headers: auth(tk.admin) })).statusCode, 204);
  assert.equal((await t.app.inject({ url: "/api/v1/produtos/TRAV50", headers: auth(tk.admin) })).statusCode, 404);
});
test("produtos: importação em lote atualiza SKUs existentes", async () => {
  const r = await t.app.inject({ method: "POST", url: "/api/v1/produtos/lote", headers: auth(tk.oper), payload: { itens: [{ sku: "A1", descricao: "A", valor: 1 }, { sku: "B1", descricao: "B", valor: 2 }] } });
  assert.deepEqual(r.json().data, { novos: 2, atualizados: 0 });
  const r2 = await t.app.inject({ method: "POST", url: "/api/v1/produtos/lote", headers: auth(tk.oper), payload: { itens: [{ sku: "a1", descricao: "A2", valor: 3 }] } });
  assert.deepEqual(r2.json().data, { novos: 0, atualizados: 1 });
});
test("filiais: unicidade de nome e código, nome imutável, desativação", async () => {
  const c = await t.app.inject({ method: "POST", url: "/api/v1/filiais", headers: auth(tk.oper), payload: { nome: "São  Paulo", codigo: "SP01" } });
  assert.equal(c.statusCode, 201); assert.equal(c.json().data.nome, "São Paulo");
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/filiais", headers: auth(tk.oper), payload: { nome: "sao paulo" } })).statusCode, 409);
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/filiais", headers: auth(tk.oper), payload: { nome: "Outra", codigo: "SP01" } })).statusCode, 409);
  const id = c.json().data.id;
  assert.equal((await t.app.inject({ method: "PATCH", url: `/api/v1/filiais/${id}`, headers: auth(tk.oper), payload: { nome: "Santos" } })).statusCode, 422);
  const d = await t.app.inject({ method: "PATCH", url: `/api/v1/filiais/${id}`, headers: auth(tk.oper), payload: { ativa: false } });
  assert.equal(d.json().data.ativa, false); assert.equal(d.json().data.historico.at(-1).acao, "Desativada");
  assert.equal((await t.app.inject({ method: "DELETE", url: `/api/v1/filiais/${id}`, headers: auth(tk.oper) })).statusCode, 403);
});
test("filiais: lote é tudo ou nada (rollback em conflito)", async () => {
  await t.app.inject({ method: "POST", url: "/api/v1/filiais", headers: auth(tk.admin), payload: { nome: "Bauru", codigo: "BAU" } });
  const antes = (await t.app.inject({ url: "/api/v1/filiais", headers: auth(tk.admin) })).json().total;
  const r = await t.app.inject({ method: "POST", url: "/api/v1/filiais/lote", headers: auth(tk.admin), payload: { itens: [{ nome: "Natal", codigo: "NAT" }, { nome: "Jundiaí", codigo: "BAU" }] } });
  assert.equal(r.statusCode, 409);
  assert.equal((await t.app.inject({ url: "/api/v1/filiais", headers: auth(tk.admin) })).json().total, antes, "nenhuma filial do lote foi gravada");
});
