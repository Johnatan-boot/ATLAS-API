import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { auth, isoOffset, seedCadastros, seedUsers, setup, type TestCtx } from "./helpers.js";

let t: TestCtx; let tk: { admin: string; oper: string; visu: string };
before(async () => { t = await setup(); tk = await seedUsers(t); await seedCadastros(t, tk.admin); });
after(async () => t.close());
const base = { cliente: "30044", pedido: "ML-1", produtos: [{ sku: "CMP078", qtd: 2, valorUnit: 500 }] };
const post = (p: object, token = tk.oper) => t.app.inject({ method: "POST", url: "/api/v1/envios", headers: auth(token), payload: p });

test("Envio Normal: valor da NF calculado e validações de datas", async () => {
  const r = await post({ ...base, tipo: "normal", dataFaturamento: isoOffset(-2), dataLimite: isoOffset(3), transportadora: "Jadlog", valorNF: 1 });
  assert.equal(r.statusCode, 201, r.body); assert.equal(r.json().data.valorNF, 1000); assert.equal(r.json().data.produtos[0].valorCatalogo, 508.69);
  assert.equal((await post({ ...base, tipo: "normal", dataFaturamento: isoOffset(0), dataLimite: isoOffset(-1), transportadora: "J" })).statusCode, 422);
  assert.equal((await post({ ...base, tipo: "coleta", dataFaturamento: isoOffset(0), dataLimite: isoOffset(2) })).statusCode, 422, "transportadora obrigatória");
  assert.equal((await post({ ...base, tipo: "outro" })).statusCode, 400);
});
test("Flex: status e data de entrega; Entregue registra a data", async () => {
  const r = await post({ ...base, pedido: "ML-F", tipo: "flex", dataEntrega: isoOffset(2), statusFlex: "em_rota" });
  assert.equal(r.statusCode, 201); assert.equal(r.json().data.transportadora, ""); assert.equal(r.json().data.entregueEm, null);
  const p = await t.app.inject({ method: "PATCH", url: `/api/v1/envios/${r.json().data.id}`, headers: auth(tk.oper), payload: { statusFlex: "entregue" } });
  assert.equal(p.json().data.entregueEm, isoOffset(0)); assert.equal(p.json().data.historico.at(-1).acao, "Status Flex: Entregue");
});
test("filtro de status calculado em dias úteis e permissões", async () => {
  await post({ ...base, pedido: "ML-ATR", tipo: "normal", dataFaturamento: isoOffset(-30), dataLimite: isoOffset(-20), transportadora: "Correios" });
  const l = await t.app.inject({ url: "/api/v1/envios?status=atrasada", headers: auth(tk.visu) });
  assert.equal(l.statusCode, 200); assert.ok(l.json().data.some((e: { pedido: string }) => e.pedido === "ML-ATR"));
  assert.equal((await post({ ...base, tipo: "flex", dataEntrega: isoOffset(1) }, tk.visu)).statusCode, 403);
  const id = l.json().data[0].id;
  assert.equal((await t.app.inject({ method: "DELETE", url: `/api/v1/envios/${id}`, headers: auth(tk.oper) })).statusCode, 403);
  assert.equal((await t.app.inject({ method: "DELETE", url: `/api/v1/envios/${id}`, headers: auth(tk.admin) })).statusCode, 204);
});
