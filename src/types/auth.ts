export type Grupo = "admin" | "operador" | "visualizador";
export interface AuthUser { id: string; usuario: string; email: string; grupo: Grupo }
export type Acao = "ler" | "criar" | "editar" | "excluir";
