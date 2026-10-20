export type CategoriaAgenda = "cot" | "prazo" | "coleta" | "normal" | "flex";
export interface EventoAgenda { cat: CategoriaAgenda; date: string; mod: "cot" | "col" | "env"; id: string; pedido: string; cliente: string; tipo: string; status: string; feriado: boolean }
