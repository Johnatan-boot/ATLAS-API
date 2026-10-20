import type { Env } from "../config/env.js";
import type { Database } from "../db/database.js";
import { AuthRepository } from "../modules/auth/repository.js";
import { AuthService } from "../modules/auth/service.js";
import { createColetasRepository } from "../modules/coletas/repository.js";
import { PedidosRepository } from "../modules/cotacoes/repository.js";
import { PedidosService } from "../modules/cotacoes/service.js";
import { EnviosRepository } from "../modules/envios/repository.js";
import { EnviosService } from "../modules/envios/service.js";
import { FiliaisRepository } from "../modules/filiais/repository.js";
import { FiliaisService } from "../modules/filiais/service.js";
import { IndicadoresRepository } from "../modules/indicadores/repository.js";
import { IndicadoresService } from "../modules/indicadores/service.js";
import { AgendaRepository } from "../modules/agenda/repository.js";
import { AgendaService } from "../modules/agenda/service.js";
import { NotificacoesRepository } from "../modules/notificacoes/repository.js";
import { NotificacoesService } from "../modules/notificacoes/service.js";
import { ProdutosRepository } from "../modules/produtos/repository.js";
import { ProdutosService } from "../modules/produtos/service.js";
import { UsuariosRepository } from "../modules/usuarios/repository.js";
import { UsuariosService } from "../modules/usuarios/service.js";

/** Composição das dependências (injeção manual, sem framework). */
export function buildContext(env: Env, db: Database) {
  const usuariosRepo = new UsuariosRepository(db);
  const usuarios = new UsuariosService(db, usuariosRepo, env.BCRYPT_ROUNDS);
  const auth = new AuthService(db, new AuthRepository(db), usuariosRepo, usuarios, { jwtSecret: env.JWT_SECRET, issuer: env.JWT_ISSUER, accessTtl: env.ACCESS_TOKEN_TTL_SECONDS, refreshDays: env.REFRESH_TOKEN_TTL_DAYS, bcryptRounds: env.BCRYPT_ROUNDS });
  const filiais = new FiliaisService(db, new FiliaisRepository(db));
  const produtosRepo = new ProdutosRepository(db);
  const produtos = new ProdutosService(db, produtosRepo);
  const cotRepo = new PedidosRepository(db, "cotacoes"), colRepo = createColetasRepository(db), envRepo = new EnviosRepository(db);
  const cotacoes = new PedidosService(db, cotRepo, filiais, produtosRepo, "Cotação");
  const coletas = new PedidosService(db, colRepo, filiais, produtosRepo, "Coleta");
  const envios = new EnviosService(db, envRepo, produtosRepo);
  const notificacoes = new NotificacoesService(new NotificacoesRepository(db), cotRepo, colRepo, envRepo);
  const indicadores = new IndicadoresService(new IndicadoresRepository(cotRepo, colRepo, envRepo));
  const agenda = new AgendaService(new AgendaRepository(cotRepo, colRepo, envRepo));
  return { env, db, auth, usuarios, filiais, produtos, cotacoes, coletas, envios, notificacoes, indicadores, agenda };
}
export type AppContext = ReturnType<typeof buildContext>;
declare module "fastify" { interface FastifyInstance { ctx: AppContext } }
