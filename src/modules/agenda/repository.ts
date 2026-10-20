import type { PedidosRepository } from "../cotacoes/repository.js";
import type { EnviosRepository } from "../envios/repository.js";
export class AgendaRepository {
  constructor(readonly cot: PedidosRepository, readonly col: PedidosRepository, readonly env: EnviosRepository) {}
}
