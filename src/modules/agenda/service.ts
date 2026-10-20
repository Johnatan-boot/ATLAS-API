import { holidays, parseISO } from "../shared/dates.js";
import { envioStatus, quoteStatus } from "../shared/status.js";
import type { AuthUser } from "../../types/auth.js";
import { can } from "../../middlewares/auth.js";
import type { CategoriaAgenda, EventoAgenda } from "./model.js";
import type { AgendaRepository } from "./repository.js";

const isHol = (iso: string) => { const d = parseISO(iso); return !!d && holidays(d.getFullYear()).has(iso); };

/** Eventos derivados dos registros (a Agenda do ATLAS não possui eventos avulsos; é somente consulta). */
export class AgendaService {
  constructor(private readonly repo: AgendaRepository) {}
  async eventos(user: AuthUser, de: string, ate: string, cats?: CategoriaAgenda[]) {
    const out: EventoAgenda[] = [];
    const push = (e: Omit<EventoAgenda, "feriado">) => { if (e.date >= de && e.date <= ate && (!cats || cats.includes(e.cat))) out.push({ ...e, feriado: isHol(e.date) }); };
    const fromPedidos = async (mod: "cot" | "col") => {
      const arr = await (mod === "cot" ? this.repo.cot : this.repo.col).all();
      for (const q of arr) {
        const st = quoteStatus(q).key;
        push({ cat: mod === "col" ? "coleta" : "cot", date: q.dataEmbarque, mod, id: q.id, pedido: q.pedido, cliente: q.cliente, tipo: mod === "col" ? "Coleta agendada" : "Cotação agendada", status: st });
        push({ cat: mod === "col" ? "coleta" : "prazo", date: q.dataPrevista, mod, id: q.id, pedido: q.pedido, cliente: q.cliente, tipo: mod === "col" ? "Prazo da coleta" : "Prazo de entrega da cotação", status: st });
      }
    };
    if (can(user, "cotacoes", "ler")) await fromPedidos("cot");
    if (can(user, "coletas", "ler")) await fromPedidos("col");
    if (can(user, "envios", "ler")) {
      for (const e of await this.repo.env.all()) {
        const st = envioStatus(e).key;
        if (e.tipo === "flex" && e.dataEntrega) push({ cat: "flex", date: e.dataEntrega, mod: "env", id: e.id, pedido: e.pedido, cliente: e.cliente, tipo: "Entrega Flex", status: st });
        if (e.tipo === "normal" && e.dataLimite) push({ cat: "normal", date: e.dataLimite, mod: "env", id: e.id, pedido: e.pedido, cliente: e.cliente, tipo: "Data limite de entrega", status: st });
        if (e.tipo === "coleta" && e.dataLimite) push({ cat: "coleta", date: e.dataLimite, mod: "env", id: e.id, pedido: e.pedido, cliente: e.cliente, tipo: "Previsão de coleta (Marketplace)", status: st });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || a.cat.localeCompare(b.cat));
    return out;
  }
}
