import type { Database } from "../../db/database.js";
import { PedidosRepository } from "../cotacoes/repository.js";
export const createColetasRepository = (db: Database) => new PedidosRepository(db, "coletas");
