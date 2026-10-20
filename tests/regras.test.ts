import { test } from "node:test";
import assert from "node:assert/strict";
import { addBusinessDays, businessDaysUntil, holidays, isBusiness, parseISO, toISO } from "../src/modules/shared/dates.js";
import { envioStatus, quoteStatus } from "../src/modules/shared/status.js";
import { melhorOpcao } from "../src/modules/cotacoes/service.js";

test("dias úteis pulam fim de semana e feriados nacionais", () => {
  assert.equal(toISO(addBusinessDays("2026-10-09", 1)!), "2026-10-13"); // sex -> seg 12/10 é feriado -> ter 13
  assert.equal(toISO(addBusinessDays("2026-09-28", 5)!), "2026-10-05");
  assert.equal(isBusiness(parseISO("2026-12-25")!), false);
});
test("Sexta-feira Santa é feriado móvel", () => {
  assert.ok(holidays(2026).has("2026-04-03"));
  assert.ok(holidays(2027).has("2027-03-26"));
});
test("businessDaysUntil conta dias úteis após a data inicial", () => {
  assert.equal(businessDaysUntil(parseISO("2026-09-26")!, parseISO("2026-09-30")!), 3);
});
test("datas inválidas são rejeitadas", () => {
  assert.equal(parseISO("2026-02-30"), null); assert.equal(parseISO("30/09/2026"), null);
});
test("status de cotação: andamento, atrasada, entregue e entregue atrasado", () => {
  const now = new Date(2026, 9, 15);
  assert.equal(quoteStatus({ dataEmbarque: "2026-10-14", prazoDias: 3 }, now).key, "andamento");
  const late = quoteStatus({ dataEmbarque: "2026-10-01", prazoDias: 2 }, now);
  assert.equal(late.key, "atrasada"); assert.equal(late.delay, 10);
  assert.equal(quoteStatus({ dataEmbarque: "2026-10-01", prazoDias: 2, entregueEm: "2026-10-05" }, now).key, "entregue");
  const ea = quoteStatus({ dataEmbarque: "2026-10-01", prazoDias: 2, entregueEm: "2026-10-07" }, now);
  assert.equal(ea.key, "entregue_atrasado"); assert.equal(ea.delay, 2);
});
test("status de envio usa dias úteis e status do Flex", () => {
  const now = new Date(2026, 9, 15);
  assert.equal(envioStatus({ tipo: "normal", dataLimite: "2026-10-09" }, now).key, "atrasada");
  assert.equal(envioStatus({ tipo: "flex", dataEntrega: "2026-10-20", statusFlex: "em_rota" }, now).key, "andamento");
  assert.equal(envioStatus({ tipo: "flex", dataEntrega: "2026-10-09", statusFlex: "entregue", entregueEm: "2026-10-09" }, now).key, "entregue");
});
test("melhor opção: menor valor e, no empate, menor prazo", () => {
  assert.equal(melhorOpcao([{ numero: "", transportadora: "A", valorFrete: 600, prazoDias: 5 }, { numero: "", transportadora: "B", valorFrete: 548.9, prazoDias: 7 }, { numero: "", transportadora: "C", valorFrete: 548.9, prazoDias: 4 }]), 2);
  assert.equal(melhorOpcao([]), -1);
});
