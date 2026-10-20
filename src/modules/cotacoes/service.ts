import type { Database } from "../../db/database.js";
import { forbidden, notFound, unprocessable } from "../../errors/app-error.js";
import type { AuthUser } from "../../types/auth.js";
import { newId, nowISO, skuKey } from "../../utils/ids.js";
import { auditLog, stamp } from "../shared/audit.js";
import { addBusinessDays, round2, round3, toISO } from "../shared/dates.js";
import type { FiliaisService } from "../filiais/service.js";
import type { ProdutosRepository } from "../produtos/repository.js";
import type { CotacaoDoc, Observacao, OpcaoFrete, ProdutoItem, StatusFiltro } from "./model.js";
import type { PedidosRepository } from "./repository.js";
import { CotacaoBody, type CotacaoInput, type CotacaoPatchInput } from "./schema.js";

/** Melhor opção da Calculadora de frete: menor valor; empate (≤ R$ 0,004) pelo menor prazo — mesma regra do frontend. */
export function melhorOpcao(ops: OpcaoFrete[]): number {
  let best = -1;
  ops.forEach((o, i) => {
    const b = ops[best];
    if (!b || o.valorFrete < b.valorFrete - 0.004 || (Math.abs(o.valorFrete - b.valorFrete) <= 0.004 && o.prazoDias < b.prazoDias)) best = i;
  });
  return best;
}

export class PedidosService {
  constructor(private readonly db: Database, readonly repo: PedidosRepository, private readonly filiais: FiliaisService, private readonly produtos: ProdutosRepository, readonly rotulo: string) {}

  async list(q: { status?: StatusFiltro; cliente?: string; transportadora?: string; uf?: string; filial?: string; periodo: "embarque" | "previsao"; de?: string; ate?: string; page: number; pageSize: number }) {
    const { rows, total } = await this.repo.list({ ...q, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
    return { data: rows, page: q.page, pageSize: q.pageSize, total };
  }
  async get(id: string) { const d = await this.repo.find(id); if (!d) throw notFound(`${this.rotulo} não encontrada.`); return d; }

  /** Recalcula no servidor todos os campos derivados e valida as regras de negócio. */
  private async build(tx: Database, input: CotacaoInput, prev: CotacaoDoc | null, user: AuthUser): Promise<Omit<CotacaoDoc, "id" | "criadoEm" | "criadoPor" | "alteradoEm" | "alteradoPor" | "atualizadoEm" | "historico">> {
    // Filial: obrigatória, cadastrada e ativa (exceto quando mantida igual em uma edição).
    let filial = input.filial;
    const fr = await this.filiais.resolveAtiva(input.filial, tx);
    if (fr) filial = fr.nome;
    else if (!prev || prev.filial !== input.filial) throw unprocessable("Escolha uma filial cadastrada e ativa.");

    // Produtos: devem existir no cadastro (itens antigos já gravados são preservados).
    const prevBySku = new Map((prev?.produtos ?? []).map(p => [skuKey(p.sku), p]));
    const produtos: ProdutoItem[] = [];
    for (const it of input.produtos) {
      const k = skuKey(it.sku), cat = await this.produtos.find(k, tx), old = prevBySku.get(k);
      if (!cat && !old) throw unprocessable(`Produto ${it.sku} não encontrado no cadastro.`);
      const pesoUnit = cat ? (cat.peso === null ? null : Number(cat.peso)) : (old?.pesoUnit ?? it.pesoUnit ?? null);
      const valorUnit = round2(it.valorUnit); // valor unitário pode ser ajustado pelo operador; o valor do cadastro é guardado como referência
      produtos.push({
        sku: cat ? cat.sku : (old?.sku ?? it.sku), nome: it.nome || cat?.descricao || old?.nome || "", qtd: it.qtd, valorUnit,
        valorCatalogo: cat ? Number(cat.valor) : (old?.valorCatalogo ?? null),
        subtotal: round2(valorUnit * it.qtd), pesoUnit, pesoTotal: pesoUnit === null ? null : round3(pesoUnit * it.qtd),
      });
    }
    const valorPedido = round2(produtos.reduce((a, p) => a + p.subtotal, 0));
    const pesoTotal = round3(produtos.reduce((a, p) => a + (p.pesoTotal ?? 0), 0));

    // Calculadora de frete: a opção marcada define transportadora, frete e prazo.
    const opcoes: OpcaoFrete[] = (input.opcoes ?? []).map(o => ({ numero: o.numero ?? "", transportadora: o.transportadora, valorFrete: round2(o.valorFrete), prazoDias: o.prazoDias }));
    let { transportadora, valorFrete, prazoDias } = input; let numeroCotacao = input.numeroCotacao ?? "";
    let opcaoSel = 0, opcaoMelhor = 0;
    if (opcoes.length) {
      opcaoMelhor = Math.max(0, melhorOpcao(opcoes));
      opcaoSel = input.opcaoSel ?? opcaoMelhor;
      const sel = opcoes[opcaoSel];
      if (!sel) throw unprocessable("A opção de frete selecionada não existe.");
      ({ transportadora, valorFrete, prazoDias } = sel); numeroCotacao = sel.numero;
    }
    const prevista = addBusinessDays(input.dataEmbarque, prazoDias);
    if (!prevista) throw unprocessable("Não foi possível calcular a previsão de entrega.");
    const entregueEm = input.entregueEm ?? null;
    if (entregueEm && entregueEm < input.dataEmbarque) throw unprocessable("A data de entrega não pode ser anterior à entrega na transportadora.");

    // Observações: novas recebem data/hora e autor do servidor; existentes são imutáveis; exclusão só para administrador.
    const prevObs = prev?.obs ?? {};
    const obs: Record<string, Observacao> = {};
    const incoming = input.obs ?? prevObs;
    for (const [k, v] of Object.entries(incoming)) {
      if (!v) continue;
      obs[k] = prevObs[k] ?? { texto: v.texto, em: nowISO(), autorId: user.id };
    }
    const removed = Object.keys(prevObs).filter(k => !obs[k]);
    if (removed.length && user.grupo !== "admin") throw forbidden("Seu grupo não tem permissão para excluir observações.");

    return {
      cliente: input.cliente, pedido: input.pedido, filial, produtos, valorPedido, pesoTotal,
      transportadora, valorFrete: round2(valorFrete), prazoDias, numeroCotacao, opcoes, opcaoSel, opcaoMelhor,
      cep: input.cep ?? "", cidade: input.cidade, uf: input.uf, dataEmbarque: input.dataEmbarque, dataPrevista: toISO(prevista),
      rastreio: input.rastreio ?? "", rastreioImg: input.rastreioImg ?? "", rastreioImgNome: input.rastreioImgNome ?? "", obs, entregueEm,
    };
  }

  private acaoDe(prev: CotacaoDoc | null, next: { entregueEm: string | null; rastreio: string; rastreioImg: string; obs: Record<string, Observacao> }, informada?: string) {
    if (informada) return informada;
    if (!prev) return "Criação";
    if (!prev.entregueEm && next.entregueEm) return "Marcada como entregue";
    if (prev.entregueEm && !next.entregueEm) return "Entrega reaberta";
    const po = Object.keys(prev.obs ?? {}).length, no = Object.keys(next.obs).length;
    if (no > po) return "Observação incluída";
    if (no < po) return "Observação excluída";
    if (prev.rastreio !== next.rastreio || prev.rastreioImg !== next.rastreioImg) return "Rastreio atualizado";
    return "Edição";
  }

  async create(user: AuthUser, input: CotacaoInput): Promise<CotacaoDoc> {
    const id = newId(this.repo.table === "coletas" ? "cl_" : "c_");
    await this.db.transaction(async tx => {
      const body = await this.build(tx, input, null, user);
      const a = stamp(null, user, this.acaoDe(null, body, input.acao));
      await this.repo.insert(tx, { ...body, id, ...a, atualizadoEm: a.alteradoEm });
    });
    return this.get(id);
  }
  /** Substituição completa (PUT). */
  async replace(user: AuthUser, id: string, input: CotacaoInput): Promise<CotacaoDoc> {
    await this.db.transaction(async tx => {
      const prev = await this.repo.find(id, tx); if (!prev) throw notFound(`${this.rotulo} não encontrada.`);
      const body = await this.build(tx, input, prev, user);
      const a = stamp(prev, user, this.acaoDe(prev, body, input.acao));
      await this.repo.update(tx, { ...body, id, ...a, atualizadoEm: a.alteradoEm });
    });
    return this.get(id);
  }
  /** Atualização parcial (PATCH). "obs" é mesclado por chave; valor null remove a observação (somente administrador). */
  async patch(user: AuthUser, id: string, patch: CotacaoPatchInput): Promise<CotacaoDoc> {
    await this.db.transaction(async tx => {
      const prev = await this.repo.find(id, tx); if (!prev) throw notFound(`${this.rotulo} não encontrada.`);
      const obs: Record<string, Observacao | null> = { ...prev.obs };
      if (patch.obs) for (const [k, v] of Object.entries(patch.obs)) { if (v === null) delete obs[k]; else obs[k] = obs[k] ?? { texto: v.texto, em: "", autorId: null }; }
      const merged = CotacaoBody.parse({
        cliente: prev.cliente, pedido: prev.pedido, filial: prev.filial, produtos: prev.produtos, transportadora: prev.transportadora, valorFrete: prev.valorFrete,
        prazoDias: prev.prazoDias, numeroCotacao: prev.numeroCotacao, opcoes: prev.opcoes, opcaoSel: prev.opcoes?.length ? prev.opcaoSel : undefined, cep: prev.cep,
        cidade: prev.cidade, uf: prev.uf, dataEmbarque: prev.dataEmbarque, rastreio: prev.rastreio, rastreioImg: prev.rastreioImg, rastreioImgNome: prev.rastreioImgNome,
        entregueEm: prev.entregueEm, ...patch, obs,
      });
      const body = await this.build(tx, merged, prev, user);
      const a = stamp(prev, user, this.acaoDe(prev, body, patch.acao));
      await this.repo.update(tx, { ...body, id, ...a, atualizadoEm: a.alteradoEm });
    });
    return this.get(id);
  }
  async remove(user: AuthUser, id: string) {
    await this.db.transaction(async tx => {
      const prev = await this.repo.find(id, tx); if (!prev) throw notFound(`${this.rotulo} não encontrada.`);
      await this.repo.delete(tx, id);
      await auditLog(tx, user, `${this.repo.table}.excluir`, this.repo.table, id, { pedido: prev.pedido, cliente: prev.cliente });
    });
  }
}
