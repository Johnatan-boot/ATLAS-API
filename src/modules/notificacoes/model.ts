export type ModuloNotif = "cot" | "col" | "env";
export interface Notificacao { id: string; mod: ModuloNotif; qid: string; type: "prazo" | "atraso"; date: string; days: number; pedido: string; cliente: string; title: string; msg: string; resolved: boolean; lida: boolean }
export const ALERT_DAYS = 5;   // dias úteis antes da previsão (regra do negócio)
export const MAX_DAILY = 60;   // limite de avisos diários de atraso mantidos por registro
