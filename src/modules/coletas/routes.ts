import { pedidosRoutes } from "../cotacoes/routes.js";
export const coletasRoutes = pedidosRoutes("coletas", app => app.ctx.coletas);
