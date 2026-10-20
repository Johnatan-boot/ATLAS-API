import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { auth, cotacaoPayload, isoOffset, seedCadastros, seedUsers, setup, type TestCtx } from "./helpers.js";

let t: TestCtx; let tk: { admin: string; oper: string; visu: string };
before(async () => { t = await setup(); tk = await seedUsers(t); await seedCadastros(t, tk.admin); });
after(async () => t.close());
const post = (url: string, token: string, payload: unknown) => t.app.inject({ method: "POST", url, headers: auth(token), payload: payload as object });

test("servidor recalcula valores, previsão e melhor opção; preserva o contrato do frontend", async () => {
  const r = await post("/api/v1/cotacoes", tk.oper, { ...cotacaoPayload(), valorPedido: 1, dataPrevista: "2000-01-01", historico: [{ acao: "forjado" }], criadoPor: "hacker" });
  assert.equal(r.statusCode, 201, r.body);
  const d = r.json().data;
  assert.equal(d.filial, "São Paulo", "filial normalizada a partir do código");
  assert.equal(d.valorPedido, 1617.38);
  assert.equal(d.produtos[0].subtotal, 1017.38); assert.equal(d.produtos[0].valorCatalogo, 508.69);
  assert.equal(d.produtos[1].valorUnit, 600); assert.equal(d.produtos[1].valorCatalogo, 612.4, "valor unitário ajustado mantém o do cadastro como referência");
  assert.equal(d.pesoTotal, 65); assert.equal(d.produtos[1].pesoTotal, null);
  assert.equal(d.opcaoMelhor, 2); assert.equal(d.opcaoSel, 2); assert.equal(d.transportadora, "TNT"); assert.equal(d.valorFrete, 548.9); assert.equal(d.prazoDias, 4);
  assert.notEqual(d.dataPrevista, "2000-01-01");
  assert.equal(d.historico.length, 1); assert.equal(d.historico[0].acao, "Criação");
  const me = (await t.app.inject({ url: "/api/v1/auth/me", headers: auth(tk.oper) })).json().usuario;
  assert.equal(d.criadoPor, me.id);
  for (const k of ["cliente", "pedido", "opcoes", "opcaoSel", "valorFrete", "prazoDias", "dataEmbarque", "entregueEm", "historico", "obs", "cep"]) assert.ok(k in d, `campo ${k}`);
});
test("escolha manual de outra opção é respeitada", async () => {
  const r = await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-2", opcaoSel: 0 }));
  assert.equal(r.json().data.transportadora, "Braspress"); assert.equal(r.json().data.opcaoMelhor, 2);
});
test("validações de entrada e de domínio", async () => {
  assert.equal((await post("/api/v1/cotacoes", tk.oper, { ...cotacaoPayload(), uf: "XX" })).statusCode, 400);
  assert.equal((await post("/api/v1/cotacoes", tk.oper, { ...cotacaoPayload(), produtos: [] })).statusCode, 400);
  assert.equal((await post("/api/v1/cotacoes", tk.oper, { ...cotacaoPayload(), cep: "123" })).statusCode, 400);
  assert.equal((await post("/api/v1/cotacoes", tk.oper, { ...cotacaoPayload(), rastreio: "javascript:alert(1)" })).statusCode, 400);
  assert.equal((await post("/api/v1/cotacoes", tk.oper, { ...cotacaoPayload(), rastreioImg: "data:text/html;base64,PHNjcmlwdD4=" })).statusCode, 400);
  const f = await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ filial: "Campinas" }));
  assert.equal(f.statusCode, 422, "filial inativa"); assert.equal(f.json().error.code, "BUSINESS_RULE");
  assert.equal((await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ filial: "Inexistente" }))).statusCode, 422);
  assert.equal((await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ produtos: [{ sku: "NAOEXISTE", qtd: 1, valorUnit: 1 }] }))).statusCode, 422);
  assert.equal((await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ entregueEm: isoOffset(-30) }))).statusCode, 422);
  assert.equal((await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ opcaoSel: 9 }))).statusCode, 422);
});
test("permissões: visualizador só lê; operador não exclui; admin exclui", async () => {
  const c = (await post("/api/v1/cotacoes", tk.admin, cotacaoPayload({ pedido: "PV-DEL" }))).json().data;
  assert.equal((await t.app.inject({ url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.visu) })).statusCode, 200);
  assert.equal((await post("/api/v1/cotacoes", tk.visu, cotacaoPayload())).statusCode, 403);
  assert.equal((await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.visu), payload: { cliente: "x" } })).statusCode, 403);
  assert.equal((await t.app.inject({ url: "/api/v1/coletas", headers: auth(tk.visu) })).statusCode, 403, "visualizador não vê Coletas");
  assert.equal((await t.app.inject({ method: "DELETE", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper) })).statusCode, 403);
  assert.equal((await t.app.inject({ method: "DELETE", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.admin) })).statusCode, 204);
  assert.equal((await t.app.inject({ url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.admin) })).statusCode, 404);
});
test("entrega, reabertura e histórico com ações", async () => {
  const c = (await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-ENT" }))).json().data;
  const e = await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: { entregueEm: isoOffset(0) } });
  assert.equal(e.statusCode, 200); assert.equal(e.json().data.historico.at(-1).acao, "Marcada como entregue");
  const r = await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: { entregueEm: null } });
  assert.equal(r.json().data.historico.at(-1).acao, "Entrega reaberta");
  const tr = await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: { rastreio: "https://rastreio.exemplo.com/1" } });
  assert.equal(tr.json().data.historico.at(-1).acao, "Rastreio atualizado");
});
test("observações: data/autor definidos pelo servidor; exclusão só para admin", async () => {
  const c = (await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-OBS" }))).json().data;
  const p = await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: { obs: { o1: { texto: "Entregar pela manhã", em: "1999-01-01T00:00:00Z", autorId: "forjado" } } } });
  assert.equal(p.statusCode, 200);
  const o = p.json().data.obs.o1;
  assert.notEqual(o.em, "1999-01-01T00:00:00Z"); assert.notEqual(o.autorId, "forjado");
  assert.equal(p.json().data.historico.at(-1).acao, "Observação incluída");
  assert.equal((await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: { obs: { o1: null } } })).statusCode, 403);
  const putSemObs = await t.app.inject({ method: "PUT", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: cotacaoPayload({ pedido: "PV-OBS", obs: {} }) });
  assert.equal(putSemObs.statusCode, 403, "remover observação via PUT também é bloqueado");
  const del = await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.admin), payload: { obs: { o1: null } } });
  assert.equal(del.statusCode, 200); assert.deepEqual(del.json().data.obs, {});
});
test("filtros por status e paginação", async () => {
  await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-ATR", dataEmbarque: isoOffset(-40) }));
  const atr = await t.app.inject({ url: "/api/v1/cotacoes?status=atrasada", headers: auth(tk.oper) });
  assert.ok(atr.json().data.every((d: { pedido: string }) => d.pedido === "PV-ATR"));
  const pg = await t.app.inject({ url: "/api/v1/cotacoes?pageSize=1&page=2", headers: auth(tk.oper) });
  assert.equal(pg.json().data.length, 1); assert.ok(pg.json().total >= 3);
  assert.equal((await t.app.inject({ url: "/api/v1/cotacoes?pageSize=5000", headers: auth(tk.oper) })).statusCode, 400);
  assert.equal((await t.app.inject({ url: "/api/v1/cotacoes?periodo=data_embarque;DROP", headers: auth(tk.oper) })).statusCode, 400, "parâmetros arbitrários não chegam ao SQL");
  const inj = await t.app.inject({ url: `/api/v1/cotacoes?cliente=${encodeURIComponent("' OR 1=1 --")}`, headers: auth(tk.oper) });
  assert.equal(inj.statusCode, 200); assert.equal(inj.json().total, 0);
});
test("coletas usam a mesma regra em base separada", async () => {
  const r = await post("/api/v1/coletas", tk.oper, cotacaoPayload({ pedido: "CL-1" }));
  assert.equal(r.statusCode, 201); assert.match(r.json().data.id, /^cl_/);
  const cot = await t.app.inject({ url: "/api/v1/cotacoes?pageSize=1000", headers: auth(tk.oper) });
  assert.ok(!cot.json().data.some((d: { pedido: string }) => d.pedido === "CL-1"));
});
test("transação: falha no meio não grava nada", async () => {
  const antes = (await t.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM cotacoes"))!.n;
  await assert.rejects(t.db.transaction(async tx => {
    await tx.run("INSERT INTO cotacoes (id, cliente, pedido, filial, transportadora, cidade, uf, data_embarque, prazo_dias, data_prevista, dados, criado_em, alterado_em, historico) VALUES ('tx1','c','p','f','t','x','PE','2026-01-01',1,'2026-01-02','{}','x','x','[]')");
    throw new Error("falha simulada");
  }));
  assert.equal((await t.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM cotacoes"))!.n, antes);
});
