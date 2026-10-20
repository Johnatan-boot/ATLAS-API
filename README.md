<div align="center">

# ATLAS API

**O back-end do ATLAS, o sistema de gestão logística da King Star.**
Cotações de frete, coletas e envios de marketplace em um só lugar, com permissões por perfil e trilha de auditoria.

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-desenvolvimento-003B57?logo=sqlite&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8%2B%20produ%C3%A7%C3%A3o-4479A1?logo=mysql&logoColor=white)
![Testes](https://img.shields.io/badge/testes-52%20passando-brightgreen)
![Licença](https://img.shields.io/badge/licen%C3%A7a-privada-lightgrey)

</div>

---

## Sumário

- [O que é](#o-que-é)
- [Funcionalidades](#funcionalidades)
- [Começando](#começando)
- [Administrador: criar e redefinir senha](#administrador-criar-e-redefinir-senha)
- [Configuração (.env)](#configuração-env)
- [Produção (MySQL 8)](#produção-mysql-8)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Autenticação e permissões](#autenticação-e-permissões)
- [Segurança](#segurança)
- [Testes](#testes)
- [Frontend](#frontend)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Solução de problemas](#solução-de-problemas)
- [Status e pendências](#status-e-pendências)
- [Documentação](#documentação)

---

## O que é

O **ATLAS API** reúne em uma API REST tudo o que a operação logística da King Star precisa: cotações de frete, coletas, envios de marketplace (Normal e Flex), produtos, filiais, usuários, notificações, indicadores e agenda.

Ele também **serve o frontend do ATLAS na mesma origem**, então um único processo entrega a tela e os dados.

| | |
|---|---|
| **Linguagem** | Node.js 20+ e TypeScript em modo estrito |
| **Framework** | Fastify 5, com validação de entrada em Zod |
| **Autenticação** | JWT (HS256) com renovação de sessão rotativa e bcrypt |
| **Banco de dados** | SQLite (better-sqlite3) em desenvolvimento · MySQL 8+ (mysql2) em produção |
| **Testes** | Node.js Test Runner, 52 testes |

## Funcionalidades

- **Cotações de frete**: valores e previsão recalculados no servidor, escolha da melhor opção (menor valor e, no empate, menor prazo) e histórico de ações.
- **Coletas**: mesma regra das cotações, em base separada.
- **Envios de marketplace**: Normal e Flex, com status calculado em dias úteis (fins de semana e feriados nacionais, incluindo os móveis).
- **Produtos e filiais**: cadastro, busca, importação em lote e desativação.
- **Usuários e permissões**: três grupos, com proteção do último administrador.
- **Notificações, indicadores e agenda**: gerados a partir dos dados reais.
- **Auditoria**: login, falhas de login, exclusões e alterações de usuários ficam registrados.

## Começando

### Requisitos

- **Node.js 20 ou superior** (testado com Node 22 e Node 24)
- Para produção: **MySQL 8.0+**
- Python 3, `make` e `g++` só são necessários se o `better-sqlite3` precisar ser compilado, o que não acontece com as versões atuais de Node, que têm binário pronto.

### Instalação (SQLite)

```bash
npm ci
cp .env.example .env          # no PowerShell: Copy-Item .env.example .env
```

Gere um segredo e cole em `JWT_SECRET` no `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Crie o primeiro administrador (veja a [próxima seção](#administrador-criar-e-redefinir-senha)) e suba o servidor:

```bash
npm run dev                   # http://localhost:3333 (frontend) e /api/v1 (API)
```

O arquivo do SQLite (`./data/atlas.db`) e a pasta são criados automaticamente, com integridade referencial ativa e modo WAL. As migrations rodam sozinhas ao iniciar o servidor.

> **Aviso do npm sobre `install-scripts`:** em versões novas do npm, o `npm ci` pode listar o `better-sqlite3` e o `esbuild` como pacotes com scripts de instalação ainda não aprovados. Se o `npm test` passar, o aviso é só informativo. Se aparecer `Could not locate the bindings file`, rode `npm install-scripts approve better-sqlite3` e depois `npm rebuild better-sqlite3`.

## Administrador: criar e redefinir senha

Não existe usuário fixo no código nem senha no repositório. O primeiro administrador é criado **somente no servidor**.

### Criar o primeiro administrador

A forma mais simples, que funciona em qualquer terminal, é usar o `.env`. Preencha as três linhas **sem aspas e sem espaços**:

```dotenv
ADMIN_EMAIL=voce@suaempresa.com.br
ADMIN_USUARIO=Nome.Sobrenome
ADMIN_SENHA=uma-senha-forte-com-8-a-72-caracteres
```

```bash
npm run create-admin
```

Depois **apague a senha do `.env`** (deixe `ADMIN_SENHA=` vazia). O administrador já está gravado no banco.

Também é possível passar as variáveis na linha de comando, mas a sintaxe muda conforme o terminal:

```bash
# Git Bash / Linux / macOS
ADMIN_EMAIL='voce@suaempresa.com.br' ADMIN_USUARIO='Nome.Sobrenome' ADMIN_SENHA='senha-forte-aqui' npm run create-admin
```

```powershell
# PowerShell
$env:ADMIN_EMAIL='voce@suaempresa.com.br'; $env:ADMIN_USUARIO='Nome.Sobrenome'; $env:ADMIN_SENHA='senha-forte-aqui'; npm run create-admin
```

Regras: o usuário tem de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado) e a senha de 8 a 72 caracteres. Se já existir um administrador ativo, o script não altera nada.

### Esqueci a senha

A senha é guardada só como hash, então não dá para recuperá-la. Redefina pelo servidor, com o `.env` (ou variáveis de ambiente):

```dotenv
RESET_LOGIN=Nome.Sobrenome        # e-mail ou usuário
RESET_SENHA=uma-senha-nova-forte
```

```bash
npm run reset-password            # em produção: npm run reset-password:prod
```

A troca encerra todas as sessões abertas daquele usuário. Depois, remova as linhas `RESET_*` do `.env`.

## Configuração (.env)

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` ou `production` |
| `HOST` / `PORT` | `0.0.0.0` / `3333` | Endereço e porta do servidor |
| `DB_CLIENT` | `sqlite` | `sqlite` ou `mysql` |
| `SQLITE_FILE` | `./data/atlas.db` | Arquivo do SQLite |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | | Conexão com o MySQL (a senha é obrigatória em produção) |
| `MYSQL_POOL_SIZE` | `10` | Tamanho do pool de conexões |
| `JWT_SECRET` | **obrigatório** | Mínimo de 32 caracteres. Nunca compartilhe |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Validade do token de acesso (15 min) |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Validade da renovação de sessão |
| `BCRYPT_ROUNDS` | `12` | Custo do bcrypt |
| `CORS_ORIGINS` | `http://localhost:3333` | Origens permitidas, separadas por vírgula |
| `COOKIE_SECURE` | `false` | Use `true` em produção (HTTPS) |
| `PUBLIC_REGISTER` | `false` | Cadastro público (sempre no grupo visualizador) |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | `300` / `10` | Limite de requisições geral e de login |
| `BODY_LIMIT_BYTES` | `3145728` | Tamanho máximo do corpo (3 MB) |
| `SERVE_FRONTEND` | `true` | Serve a pasta `public/` na mesma origem |

> O `.env` está no `.gitignore`. **Nunca** faça commit dele.

## Produção (MySQL 8)

**Não use SQLite em produção em serviços de disco efêmero** (como Render e Clever Cloud): os dados somem a cada deploy ou reinício. Use MySQL.

```bash
# variáveis de ambiente (ou .env)
NODE_ENV=production
DB_CLIENT=mysql
MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=atlas
JWT_SECRET=<segredo novo, 32+ caracteres>
COOKIE_SECURE=true
CORS_ORIGINS=https://atlas.suaempresa.com.br

npm ci --include=dev && npm run build
npm run migrate:prod
npm run create-admin:prod         # com ADMIN_* definidos
npm start
```

- Crie o banco em `utf8mb4`:
  `CREATE DATABASE atlas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
- O MySQL começa **vazio**: o administrador e os dados do SQLite não migram sozinhos.
- Use HTTPS na frente da API, com `COOKIE_SECURE=true`. Em produção a API confia no proxy (`trustProxy`).
- No `SIGINT`/`SIGTERM` a API encerra com segurança: fecha o HTTP e o pool (limite de 10 s).
- O build precisa das dependências de desenvolvimento (o `tsc` está nelas). Por isso o `--include=dev` no `npm ci`.

> **Render e Clever Cloud:** o projeto foi preparado para esse tipo de plataforma (porta lida de `PORT`, escuta em `0.0.0.0`, proxy confiável), mas o deploy ainda **não foi validado** em nenhuma delas. Valide em um ambiente de teste antes de usar dados reais.

### Docker

```bash
docker compose up -d --build   # MySQL 8 + API (defina MYSQL_PASSWORD e MYSQL_ROOT_PASSWORD no .env)
docker compose exec -e ADMIN_EMAIL=... -e ADMIN_USUARIO=... -e ADMIN_SENHA=... api node dist/scripts/create-admin.js
```

> O `Dockerfile` e o `docker-compose.yml` **ainda não foram executados**. Valide antes de usar em produção.

## Banco de dados e migrations

- Migrations versionadas em `src/db/migrations/index.ts`, com SQL próprio para cada banco (SQLite e MySQL).
- A tabela `schema_migrations` registra o que já foi aplicado. Nada é reaplicado.
- Para evoluir o esquema, adicione uma nova entrada (`002_...`) com o SQL dos dois bancos e rode `npm run migrate`. **Nunca edite uma migration já aplicada.**
- A camada `src/db/database.ts` expõe a mesma interface (`query`, `get`, `run`, `exec`, `transaction`) nos dois bancos: SQL sempre parametrizado com `?`, datas em texto ISO, booleanos 0/1 e transações com rollback em caso de erro. Os mesmos 52 testes rodam nos dois.
- Para alternar entre SQLite e MySQL, mude `DB_CLIENT` e as variáveis correspondentes.

## Autenticação e permissões

- **Login:** `POST /api/v1/auth/login` com e-mail **ou** usuário. O token de acesso JWT dura 15 minutos.
- **Renovação de sessão:** cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` com `COOKIE_SECURE=true`), guardado no banco só como hash SHA-256 e **rotacionado a cada uso**. Se um token antigo for reutilizado, toda a família de sessões é revogada.
- **CSRF:** `/auth/refresh` e `/auth/logout` exigem o cabeçalho `X-Atlas-Csrf: 1` e uma origem da lista permitida.
- **Papel vem do banco:** o grupo é recarregado a cada requisição. O que o cliente ou o token diz não vale.

| Grupo | Pode |
|---|---|
| **Visualizador** | Ler cotações e envios |
| **Operador** | Incluir e editar. Não exclui nem gerencia usuários |
| **Administrador** | Tudo, incluindo exclusões e gestão de usuários |

## Segurança

- Zod em todas as entradas. Campos calculados ou protegidos enviados pelo cliente são ignorados e recalculados no servidor.
- SQL sempre parametrizado. Ordenação e colunas de filtro vêm de listas fixas.
- bcrypt com custo configurável. Login **sem enumeração de contas**: mesma resposta e mesmo custo quando o usuário não existe.
- Helmet com CSP, CORS com lista de origens, limite de requisições (global e de login) e limite de tamanho do corpo.
- Erros em formato único, sem stack trace para o cliente. Senhas, tokens e cookies são mascarados nos logs.
- Auditoria na tabela `auditoria` e histórico em cada registro.
- `npm audit --omit=dev`: 0 vulnerabilidades na data da entrega.

## Testes

```bash
npm run typecheck
npm run build
npm test                          # SQLite em memória, 52 testes
```

Com MySQL (**apaga todas as tabelas do banco indicado**, use um banco exclusivo de testes):

```bash
MYSQL_HOST=127.0.0.1 MYSQL_USER=atlas MYSQL_PASSWORD=... MYSQL_DATABASE=atlas_test npm run test:mysql
```

Ponta a ponta, em navegador real, com a API rodando e um administrador criado (rode contra um banco recém-criado, porque o teste cria registros fixos):

```bash
pip install playwright && playwright install chromium
ATLAS_URL=http://127.0.0.1:3333 ATLAS_ADMIN=<usuário> ATLAS_ADMIN_SENHA='<senha>' python3 tests/e2e/frontend_e2e.py
```

## Frontend

- `public/index.html` é o frontend ATLAS **gerado** a partir de `frontend/ATLAS.html` por `npm run build:frontend`. Se o `ATLAS.html` mudar, substitua o arquivo em `frontend/` e rode o comando de novo. O script falha se algum trecho esperado não existir, em vez de alterar algo em silêncio.
- `public/atlas-api-client.js` troca o armazenamento antigo por chamadas HTTP, mantendo a interface das telas: carga após o login, atualização a cada 15 s e logo após cada gravação, renovação automática da sessão e volta ao login quando ela expira.
- Não há fallback silencioso para `localStorage`: se a API cair, a tela mostra o erro.

## Estrutura do projeto

```
atlas-api/
├── src/
│   ├── app.ts, server.ts      # montagem do Fastify e inicialização
│   ├── config/                # leitura e validação do .env
│   ├── db/                    # camada de banco (SQLite/MySQL) e migrations
│   ├── modules/               # módulos de negócio (auth, usuários, ...)
│   ├── plugins/               # contexto e plugins do Fastify
│   ├── errors/, utils/, types/
│   └── scripts/               # create-admin, reset-password
├── public/                    # frontend servido pela API (gerado)
├── frontend/ATLAS.html        # frontend original (fonte)
├── scripts/                   # build-frontend.py
├── tests/                     # testes automatizados e e2e
├── docs/                      # API.md, DIAGNOSTICO.md, TESTES.md
├── Dockerfile, docker-compose.yml
└── .env.example
```

## Solução de problemas

| Sintoma | Causa provável e solução |
|---|---|
| `Could not find any Visual Studio installation` no `npm ci` | Versão antiga do `better-sqlite3` sem binário para o seu Node. O projeto usa a 12.11.1, que tem binário para Node 20 a 26. Reinstale com `npm ci` |
| `EPERM ... rmdir` ao instalar no Windows | Algum programa (antivírus, VS Code) segura a `node_modules`. Feche-os, apague a pasta (reinicie o PC se preciso) e rode `npm ci` |
| `JWT_SECRET precisa ter pelo menos 32 caracteres` | Falta o `.env` ou o segredo está vazio. Veja [Começando](#começando) |
| `E-mail inválido` / `A senha deve ter pelo menos 8 caracteres` no `create-admin` | As variáveis `ADMIN_*` chegaram vazias. Preencha-as no `.env`, sem aspas e sem espaços |
| `401` no login | Usuário ou senha não conferem. Use `npm run reset-password` |
| `429` no login | Limite de tentativas atingido. Aguarde alguns minutos |
| `Já existe 1 administrador(es) ativo(s)` | O administrador já foi criado. Não use `ADMIN_FORCE=1` a menos que queira outro |

## Status e pendências

- Indicadores, Agenda e a lista de Notificações ainda são calculados no navegador (mesmas fórmulas dos endpoints `/indicadores`, `/agenda` e `/notificacoes`). Os painéis ainda não consomem esses endpoints.
- A sincronização é por consulta a cada 15 s, não em tempo real.
- Imagens de rastreio ficam no próprio registro (base64, até ~2 MB). Para volumes grandes, use armazenamento de objetos.
- O filtro de status de envios é calculado em memória (depende de dias úteis).
- **Docker e deploy em Render/Clever Cloud ainda não validados.**
- Fastify 5.12.7 e os plugins foram fixados nas versões que corrigem vulnerabilidades; algumas são recentes. Revise as atualizações antes de implantar.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/API.md`](docs/API.md) | Endpoints, permissões, códigos HTTP e exemplos |
| [`docs/DIAGNOSTICO.md`](docs/DIAGNOSTICO.md) | Diagnóstico do frontend original, mapeamento para a API e decisões |
| [`docs/TESTES.md`](docs/TESTES.md) | Resultados reais das verificações |

---

<div align="center">

Desenvolvido para a **King Star** · Repositório privado

</div>
