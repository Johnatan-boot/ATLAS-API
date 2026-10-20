import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { auth, cotacaoPayload, isoOffset, seedCadastros, seedUsers, setup, type TestCtx } from "./helpers.js";

let t: TestCtx; let tk: { admin: string; oper: string; visu: string };
before(async () => {
  t = await setup(); tk = await seedUsers(t); await seedCadastros(t, tk.admin);
  const post = (url: string, p: object) => t.app.inject({ method: "POST", url, headers: auth(tk.oper), payload: p });
  await post("/api/v1/cotacoes", cotacaoPayload({ pedido: "ATRASADA", dataEmbarque: isoOffset(-30), opcoes: [], transportadora: "TNT", valorFrete: 100, prazoDias: 3 }));
  await post("/api/v1/cotacoes", cotacaoPayload({ pedido: "NO-PRAZO", dataEmbarque: isoOffset(-30), opcoes: [], transportadora: "TNT", valorFrete: 200, prazoDias: 5, entregueEm: isoOffset(-28) }));
  await post("/api/v1/cotacoes", cotacaoPayload({ pedido: "FUTURA", dataEmbarque: isoOffset(1) }));
  await post("/api/v1/envios", { cliente: "1", pedido: "ML-9", produtos: [{ sku: "CMP078", qtd: 1, valorUnit: 100 }], tipo: "normal", dataFaturamento: isoOffset(-15), dataLimite: isoOffset(-10), transportadora: "Jadlog" });
});
after(async () => t.close());

test("notificações são geradas dos dados reais, sem duplicidade, com controle de leitura", async () => {
  const r = await t.app.inject({ url: "/api/v1/notificacoes?type=atraso", headers: auth(tk.oper) });
  assert.equal(r.statusCode, 200);
  const ids = r.json().data.map((n: { id: string }) => n.id);
  assert.equal(new Set(ids).size, ids.length, "IDs determinísticos e únicos");
  assert.ok(r.json().data.some((n: { pedido: string }) => n.pedido === "ATRASADA"));
  assert.ok(r.json().data.some((n: { mod: string }) => n.mod === "env"));
  const first = ids[0];
  for (let i = 0; i < 2; i++) assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/notificacoes/lidas", headers: auth(tk.oper), payload: { ids: [first] } })).statusCode, 204);
  const cnt = await t.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM notificacao_leituras WHERE notificacao_id = ?", [first]);
  assert.equal(Number(cnt!.n), 1, "marcar duas vezes não duplica");
  const again = await t.app.inject({ url: "/api/v1/notificacoes?type=atraso", headers: auth(tk.oper) });
  assert.equal(again.json().data.find((n: { id: string }) => n.id === first).lida, true);
  const lei = await t.app.inject({ url: "/api/v1/notificacoes/leituras", headers: auth(tk.oper) });
  assert.equal(lei.json().lidas[first], true);
  assert.equal((await t.app.inject({ url: "/api/v1/notificacoes", headers: auth(tk.visu) })).statusCode, 403);
});
test("indicadores calculados no servidor, sem divisão por zero", async () => {
  const r = await t.app.inject({ url: "/api/v1/indicadores/cotacoes", headers: auth(tk.oper) });
  assert.equal(r.statusCode, 200);
  const s = r.json().data.resumo;
  assert.equal(s.n, 3); assert.equal(s.entregues, 1); assert.equal(s.noPrazo, 1); assert.equal(s.otd, 1); assert.equal(s.atrasadasAgora, 1);
  assert.equal(r.json().data.faixa.faixa, "verde");
  assert.equal(r.json().data.calculadora.melhorPreco, "TNT");
  const vazio = await t.app.inject({ url: `/api/v1/indicadores/coletas?de=${isoOffset(0)}&ate=${isoOffset(1)}`, headers: auth(tk.oper) });
  const v = vazio.json().data.resumo;
  assert.equal(v.n, 0); assert.equal(v.otd, null); assert.equal(v.fretePct, null); assert.equal(vazio.json().data.faixa.faixa, "sem_dados");
  assert.ok(vazio.json().data.periodoAnterior, "comparação com o período anterior");
  const env = await t.app.inject({ url: "/api/v1/indicadores/envios", headers: auth(tk.oper) });
  assert.equal(env.json().data.resumo.atrasadosAgora, 1);
  assert.equal((await t.app.inject({ url: `/api/v1/indicadores/cotacoes?de=${isoOffset(1)}&ate=${isoOffset(0)}`, headers: auth(tk.oper) })).statusCode, 400);
  assert.equal((await t.app.inject({ url: "/api/v1/indicadores/cotacoes", headers: auth(tk.visu) })).statusCode, 403);
});
test("agenda lista eventos do intervalo e respeita permissões", async () => {
  const r = await t.app.inject({ url: `/api/v1/agenda?de=${isoOffset(-40)}&ate=${isoOffset(40)}`, headers: auth(tk.oper) });
  assert.equal(r.statusCode, 200);
  const cats = new Set(r.json().data.map((e: { cat: string }) => e.cat));
  assert.ok(cats.has("cot") && cats.has("prazo") && cats.has("normal"));
  assert.equal((await t.app.inject({ url: `/api/v1/agenda?de=${isoOffset(0)}&ate=${isoOffset(-1)}`, headers: auth(tk.oper) })).statusCode, 400);
  assert.equal((await t.app.inject({ url: `/api/v1/agenda?de=${isoOffset(0)}&ate=${isoOffset(1)}`, headers: auth(tk.visu) })).statusCode, 403);
});
