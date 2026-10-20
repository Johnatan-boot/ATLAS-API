/**
 * Migrations versionadas. Cada migration possui SQL específico por dialeto.
 * Datas são armazenadas como texto ISO (YYYY-MM-DD / ISO 8601) para manter o
 * contrato idêntico ao frontend nos dois bancos.
 * Valores monetários usam DECIMAL no MySQL e REAL no SQLite (arredondados a 2 casas no service).
 */
export interface Migration { id: string; sqlite: string[]; mysql: string[] }

const audit = {
  sqlite: `criado_em TEXT NOT NULL, criado_por TEXT, alterado_em TEXT NOT NULL, alterado_por TEXT, historico TEXT NOT NULL DEFAULT '[]'`,
  mysql: `criado_em VARCHAR(30) NOT NULL, criado_por VARCHAR(40) NULL, alterado_em VARCHAR(30) NOT NULL, alterado_por VARCHAR(40) NULL, historico LONGTEXT NOT NULL`,
};
const M = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

const pedidoTable = (t: string) => ({
  sqlite: [
    `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY, cliente TEXT NOT NULL, pedido TEXT NOT NULL, filial TEXT NOT NULL, transportadora TEXT NOT NULL,
      cidade TEXT NOT NULL, uf TEXT NOT NULL, data_embarque TEXT NOT NULL, prazo_dias INTEGER NOT NULL, data_prevista TEXT NOT NULL,
      entregue_em TEXT, valor_pedido REAL NOT NULL DEFAULT 0, valor_frete REAL NOT NULL DEFAULT 0, dados TEXT NOT NULL, ${audit.sqlite})`,
    `CREATE INDEX idx_${t}_pedido ON ${t}(pedido)`,
    `CREATE INDEX idx_${t}_embarque ON ${t}(data_embarque)`,
    `CREATE INDEX idx_${t}_transp ON ${t}(transportadora)`,
  ],
  mysql: [
    `CREATE TABLE ${t} (
      id VARCHAR(40) PRIMARY KEY, cliente VARCHAR(60) NOT NULL, pedido VARCHAR(60) NOT NULL, filial VARCHAR(60) NOT NULL, transportadora VARCHAR(80) NOT NULL,
      cidade VARCHAR(80) NOT NULL, uf CHAR(2) NOT NULL, data_embarque CHAR(10) NOT NULL, prazo_dias INT NOT NULL, data_prevista CHAR(10) NOT NULL,
      entregue_em CHAR(10) NULL, valor_pedido DECIMAL(14,2) NOT NULL DEFAULT 0, valor_frete DECIMAL(14,2) NOT NULL DEFAULT 0, dados LONGTEXT NOT NULL, ${audit.mysql},
      INDEX idx_${t}_pedido (pedido), INDEX idx_${t}_embarque (data_embarque), INDEX idx_${t}_transp (transportadora)) ${M}`,
  ],
});

export const migrations: Migration[] = [
  {
    id: "001_init",
    sqlite: [
      `CREATE TABLE usuarios (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, usuario TEXT NOT NULL, usuario_chave TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL, grupo TEXT NOT NULL CHECK (grupo IN ('admin','operador','visualizador')), ativo INTEGER NOT NULL DEFAULT 1,
        ultimo_acesso TEXT, ${audit.sqlite})`,
      `CREATE TABLE refresh_tokens (
        id TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE,
        familia TEXT NOT NULL, expira_em TEXT NOT NULL, revogado_em TEXT, substituido_por TEXT, criado_em TEXT NOT NULL, ip TEXT, user_agent TEXT)`,
      `CREATE INDEX idx_rt_usuario ON refresh_tokens(usuario_id)`,
      `CREATE INDEX idx_rt_familia ON refresh_tokens(familia)`,
      `CREATE TABLE filiais (
        id TEXT PRIMARY KEY, nome TEXT NOT NULL, nome_chave TEXT NOT NULL UNIQUE, codigo TEXT UNIQUE, ativa INTEGER NOT NULL DEFAULT 1, ${audit.sqlite})`,
      `CREATE TABLE produtos (
        sku_chave TEXT PRIMARY KEY, sku TEXT NOT NULL, descricao TEXT NOT NULL, grupo TEXT NOT NULL DEFAULT '', familia TEXT NOT NULL DEFAULT '',
        fornecedor TEXT NOT NULL DEFAULT '', valor REAL NOT NULL, peso REAL, ${audit.sqlite})`,
      ...pedidoTable("cotacoes").sqlite,
      ...pedidoTable("coletas").sqlite,
      `CREATE TABLE envios (
        id TEXT PRIMARY KEY, cliente TEXT NOT NULL, pedido TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('normal','flex','coleta')),
        transportadora TEXT NOT NULL DEFAULT '', data_faturamento TEXT, data_limite TEXT, data_entrega TEXT, status_flex TEXT,
        entregue_em TEXT, valor_nf REAL NOT NULL DEFAULT 0, dados TEXT NOT NULL, ${audit.sqlite})`,
      `CREATE INDEX idx_envios_pedido ON envios(pedido)`,
      `CREATE TABLE notificacao_leituras (
        usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, notificacao_id TEXT NOT NULL, lida_em TEXT NOT NULL,
        PRIMARY KEY (usuario_id, notificacao_id))`,
      `CREATE TABLE auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT, em TEXT NOT NULL, usuario_id TEXT, acao TEXT NOT NULL, entidade TEXT NOT NULL, entidade_id TEXT, detalhes TEXT)`,
      `CREATE INDEX idx_auditoria_em ON auditoria(em)`,
    ],
    mysql: [
      `CREATE TABLE usuarios (
        id VARCHAR(40) PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE, usuario VARCHAR(40) NOT NULL, usuario_chave VARCHAR(40) NOT NULL UNIQUE,
        senha_hash VARCHAR(100) NOT NULL, grupo ENUM('admin','operador','visualizador') NOT NULL, ativo TINYINT(1) NOT NULL DEFAULT 1,
        ultimo_acesso VARCHAR(30) NULL, ${audit.mysql}) ${M}`,
      `CREATE TABLE refresh_tokens (
        id VARCHAR(40) PRIMARY KEY, usuario_id VARCHAR(40) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, familia VARCHAR(40) NOT NULL,
        expira_em VARCHAR(30) NOT NULL, revogado_em VARCHAR(30) NULL, substituido_por VARCHAR(40) NULL, criado_em VARCHAR(30) NOT NULL,
        ip VARCHAR(64) NULL, user_agent VARCHAR(255) NULL, INDEX idx_rt_usuario (usuario_id), INDEX idx_rt_familia (familia),
        CONSTRAINT fk_rt_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE) ${M}`,
      `CREATE TABLE filiais (
        id VARCHAR(80) PRIMARY KEY, nome VARCHAR(60) NOT NULL, nome_chave VARCHAR(80) NOT NULL UNIQUE, codigo VARCHAR(20) NULL UNIQUE,
        ativa TINYINT(1) NOT NULL DEFAULT 1, ${audit.mysql}) ${M}`,
      `CREATE TABLE produtos (
        sku_chave VARCHAR(60) PRIMARY KEY, sku VARCHAR(60) NOT NULL, descricao VARCHAR(200) NOT NULL, grupo VARCHAR(80) NOT NULL DEFAULT '',
        familia VARCHAR(80) NOT NULL DEFAULT '', fornecedor VARCHAR(120) NOT NULL DEFAULT '', valor DECIMAL(14,2) NOT NULL, peso DECIMAL(14,3) NULL, ${audit.mysql}) ${M}`,
      ...pedidoTable("cotacoes").mysql,
      ...pedidoTable("coletas").mysql,
      `CREATE TABLE envios (
        id VARCHAR(40) PRIMARY KEY, cliente VARCHAR(60) NOT NULL, pedido VARCHAR(60) NOT NULL, tipo ENUM('normal','flex','coleta') NOT NULL,
        transportadora VARCHAR(80) NOT NULL DEFAULT '', data_faturamento CHAR(10) NULL, data_limite CHAR(10) NULL, data_entrega CHAR(10) NULL,
        status_flex VARCHAR(20) NULL, entregue_em CHAR(10) NULL, valor_nf DECIMAL(14,2) NOT NULL DEFAULT 0, dados LONGTEXT NOT NULL, ${audit.mysql},
        INDEX idx_envios_pedido (pedido)) ${M}`,
      `CREATE TABLE notificacao_leituras (
        usuario_id VARCHAR(40) NOT NULL, notificacao_id VARCHAR(120) NOT NULL, lida_em VARCHAR(30) NOT NULL,
        PRIMARY KEY (usuario_id, notificacao_id), CONSTRAINT fk_nl_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE) ${M}`,
      `CREATE TABLE auditoria (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, em VARCHAR(30) NOT NULL, usuario_id VARCHAR(40) NULL, acao VARCHAR(80) NOT NULL,
        entidade VARCHAR(40) NOT NULL, entidade_id VARCHAR(120) NULL, detalhes TEXT NULL, INDEX idx_auditoria_em (em)) ${M}`,
    ],
  },
];
