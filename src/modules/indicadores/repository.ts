import type { PedidosRepository } from "../cotacoes/repository.js";
import type { EnviosRepository } from "../envios/repository.js";
/** Leitura dos dados de origem dos indicadores (os cálculos ficam no service). */
export class IndicadoresRepository {
  constructor(private readonly cot: PedidosRepository, private readonly col: PedidosRepository, private readonly env: EnviosRepository) {}
  pedidos(modulo: "cotacoes" | "coletas") { return (modulo === "cotacoes" ? this.cot : this.col).all(); }
  envios() { return this.env.all(); }
}
