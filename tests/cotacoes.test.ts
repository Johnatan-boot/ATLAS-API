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
const PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
test("observação aceita imagem anexada; ela é validada, preservada e não é reenviada pelo cliente", async () => {
  const c = (await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-IMG" }))).json().data;
  const url = `/api/v1/cotacoes/${c.id}`;
  const patch = (token: string, payload: object) => t.app.inject({ method: "PATCH", url, headers: auth(token), payload });
  // inclui com imagem
  const ok = await patch(tk.oper, { obs: { i1: { texto: "Print do rastreio", imagem: PNG_1X1, imagemNome: "print.png" } } });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().data.obs.i1.imagem, PNG_1X1); assert.equal(ok.json().data.obs.i1.imagemNome, "print.png");
  assert.equal(ok.json().data.historico.at(-1).acao, "Observação incluída");
  // a imagem volta na consulta
  assert.equal((await t.app.inject({ url, headers: auth(tk.visu) })).json().data.obs.i1.imagem, PNG_1X1);
  // observação sem imagem continua válida
  assert.equal((await patch(tk.oper, { obs: { i2: { texto: "Sem anexo" } } })).statusCode, 200);
  // imagem inválida (não é data URL de imagem) e grande demais são recusadas
  assert.equal((await patch(tk.oper, { obs: { i3: { texto: "x", imagem: "javascript:alert(1)" } } })).statusCode, 400);
  assert.equal((await patch(tk.oper, { obs: { i3: { texto: "x", imagem: "data:text/html;base64,PGI+" } } })).statusCode, 400);
  assert.equal((await patch(tk.oper, { obs: { i3: { texto: "x", imagem: "data:image/png;base64," + "A".repeat(1_500_000) } } })).statusCode, 400);
  // regravar o registro (PUT) sem a imagem da observação existente não a apaga, e não dá para trocar a imagem de uma observação existente
  const put = await t.app.inject({ method: "PUT", url, headers: auth(tk.oper), payload: cotacaoPayload({ pedido: "PV-IMG", obs: { i1: { texto: "Print do rastreio" }, i2: { texto: "Sem anexo" } } }) });
  assert.equal(put.statusCode, 200, put.body); assert.equal(put.json().data.obs.i1.imagem, PNG_1X1);
  const troca = await patch(tk.oper, { obs: { i2: { texto: "Sem anexo", imagem: PNG_1X1 } } });
  assert.equal(troca.statusCode, 200); assert.equal(troca.json().data.obs.i2.imagem, undefined, "observação existente é imutável");
  // visualizador não anexa
  assert.equal((await patch(tk.visu, { obs: { i4: { texto: "x", imagem: PNG_1X1 } } })).statusCode, 403);
  // excluir a observação (admin) remove a imagem junto
  const del = await patch(tk.admin, { obs: { i1: null } });
  assert.equal(del.statusCode, 200); assert.equal(del.json().data.obs.i1, undefined);
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

/* ---------- Número da NF (numeroNF) ---------- */
test("numeroNF: cadastro com NF preserva zeros à esquerda; cadastro sem NF retorna vazio", async () => {
  const c = await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-NF1", numeroNF: "000123" }));
  assert.equal(c.statusCode, 201, c.body); assert.equal(c.json().data.numeroNF, "000123");
  const g = await t.app.inject({ url: `/api/v1/cotacoes/${c.json().data.id}`, headers: auth(tk.visu) });
  assert.equal(g.json().data.numeroNF, "000123", "consulta devolve o valor salvo");
  const s = await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-NF2" }));
  assert.equal(s.statusCode, 201); assert.equal(s.json().data.numeroNF, "");
});
test("numeroNF: atualização de outros campos preserva a NF; a NF pode ser preenchida e alterada depois", async () => {
  const c = (await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-NF3", numeroNF: "000456" }))).json().data;
  const e = await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: { entregueEm: isoOffset(0) } });
  assert.equal(e.json().data.numeroNF, "000456", "PATCH em outro campo não apaga a NF");
  const n = await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: { numeroNF: "009999999" } });
  assert.equal(n.statusCode, 200); assert.equal(n.json().data.numeroNF, "009999999");
  const s = (await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-NF4" }))).json().data;
  const p = await t.app.inject({ method: "PUT", url: `/api/v1/cotacoes/${s.id}`, headers: auth(tk.oper), payload: cotacaoPayload({ pedido: "PV-NF4", numeroNF: "0012" }) });
  assert.equal(p.json().data.numeroNF, "0012", "preenchimento posterior pela edição completa");
});
test("numeroNF: valores inválidos são recusados", async () => {
  for (const v of ["12A", "1234567890", "12-3", " 1 2 "]) {
    const r = await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-NF-INV", numeroNF: v }));
    assert.equal(r.statusCode, 400, `valor ${JSON.stringify(v)}`);
  }
});
test("numeroNF: registro antigo sem o campo é lido como vazio e continua editável", async () => {
  const c = (await post("/api/v1/cotacoes", tk.oper, cotacaoPayload({ pedido: "PV-NF-ANTIGO", numeroNF: "1" }))).json().data;
  const row = await t.db.get<{ dados: string }>("SELECT dados FROM cotacoes WHERE id = ?", [c.id]);
  const dados = JSON.parse(row!.dados); delete dados.numeroNF;
  await t.db.run("UPDATE cotacoes SET dados = ? WHERE id = ?", [JSON.stringify(dados), c.id]);
  const g = await t.app.inject({ url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper) });
  assert.equal(g.statusCode, 200); assert.equal(g.json().data.numeroNF, "");
  const e = await t.app.inject({ method: "PATCH", url: `/api/v1/cotacoes/${c.id}`, headers: auth(tk.oper), payload: { cliente: "99999" } });
  assert.equal(e.statusCode, 200); assert.equal(e.json().data.numeroNF, "");
});
test("numeroNF: Coletas segue a mesma regra", async () => {
  const c = await post("/api/v1/coletas", tk.oper, cotacaoPayload({ pedido: "CL-NF1", numeroNF: "000777" }));
  assert.equal(c.statusCode, 201); assert.equal(c.json().data.numeroNF, "000777");
  const e = await t.app.inject({ method: "PATCH", url: `/api/v1/coletas/${c.json().data.id}`, headers: auth(tk.oper), payload: { rastreio: "https://rastreio.exemplo.com/2" } });
  assert.equal(e.json().data.numeroNF, "000777");
});
