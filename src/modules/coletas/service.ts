import type { Database } from "../../db/database.js";
import type { FiliaisService } from "../filiais/service.js";
import type { ProdutosRepository } from "../produtos/repository.js";
import { PedidosService } from "../cotacoes/service.js";
import { createColetasRepository } from "./repository.js";
export const createColetasService = (db: Database, filiais: FiliaisService, produtos: ProdutosRepository) => new PedidosService(db, createColetasRepository(db), filiais, produtos, "Coleta");
