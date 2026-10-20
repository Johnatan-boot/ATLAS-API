# ATLAS API

API REST do sistema **ATLAS (King Star)**: cotações de frete, coletas, envios marketplace, produtos, filiais, usuários e permissões, notificações, indicadores e agenda. Serve também o frontend ATLAS, já integrado à API, na mesma origem.

**Stack:** Node.js 20+ e TypeScript (modo estrito) · Fastify 5 · Zod · JWT (HS256) · bcryptjs · SQLite (better-sqlite3) em desenvolvimento · MySQL 8+ (mysql2) em produção · Node.js Test Runner.

| Documento | Conteúdo |
|---|---|
| [`docs/API.md`](docs/API.md) | Endpoints, permissões, códigos HTTP e exemplos |
| [`docs/DIAGNOSTICO.md`](docs/DIAGNOSTICO.md) | Diagnóstico do frontend original, mapeamento para a API e decisões |
| [`docs/TESTES.md`](docs/TESTES.md) | Resultados reais das verificações |

## Requisitos
- Node.js 20 ou superior (testado com Node.js 22)
- Para produção: MySQL 8.0 ou superior
- Para compilar o better-sqlite3 quando não houver binário pronto: python3, make e g++

## Uso local (SQLite)
```bash
npm ci
cp .env.example .env
# edite .env e defina JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm run migrate                       # cria ./data/atlas.db e aplica as migrations
ADMIN_EMAIL=antony.goiana@kingstarcolchoes.com.br ADMIN_USUARIO=Antony.Goiana ADMIN_SENHA='<senha forte>' npm run create-admin
npm run dev                           # http://localhost:3333 (frontend) e /api/v1 (API)
```
O arquivo e o diretório do SQLite são criados automaticamente, com integridade referencial (`foreign_keys=ON`) e modo WAL. Os dados persistem entre reinicializações; os testes usam banco em memória.

## Produção (MySQL 8)
```bash
# .env
NODE_ENV=production
DB_CLIENT=mysql
MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=atlas
JWT_SECRET=<segredo próprio>
COOKIE_SECURE=true
CORS_ORIGINS=https://atlas.suaempresa.com.br

npm ci && npm run build
npm run migrate:prod
ADMIN_EMAIL=... ADMIN_USUARIO=... ADMIN_SENHA=... npm run create-admin:prod
npm start
```
- Crie o banco com `utf8mb4`: `CREATE DATABASE atlas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
- Pool configurável (`MYSQL_POOL_SIZE`) e timeout (`MYSQL_CONNECT_TIMEOUT_MS`).
- No `SIGINT`/`SIGTERM` a API encerra com segurança: fecha o HTTP e o pool (limite de 10 s).
- Use HTTPS na frente da API (proxy reverso) com `COOKIE_SECURE=true`.

### Docker
```bash
docker compose up -d --build   # MySQL 8 + API (defina MYSQL_PASSWORD e MYSQL_ROOT_PASSWORD no .env)
docker compose exec -e ADMIN_EMAIL=... -e ADMIN_USUARIO=... -e ADMIN_SENHA=... api node dist/scripts/create-admin.js
```
> O Dockerfile e o docker-compose.yml **não foram executados** no ambiente de desenvolvimento (sem Docker). Valide antes de usar em produção.

## Migrations
- Versionadas em `src/db/migrations/index.ts`, com SQL próprio para cada dialeto.
- A tabela `schema_migrations` registra o que já foi aplicado; nada é reaplicado (execução idempotente e testada).
- Para evoluir: adicione uma nova entrada (`002_...`) com SQL de `sqlite` e `mysql` e rode `npm run migrate`. Nunca edite uma migration já aplicada.

## Alternar entre SQLite e MySQL
Mude `DB_CLIENT=sqlite|mysql` e as variáveis correspondentes. A camada `src/db/database.ts` expõe a mesma interface (`query`, `get`, `run`, `exec`, `transaction`) nos dois bancos: SQL sempre parametrizado com `?`, datas como texto ISO, booleanos 0/1 e transações que usam a mesma conexão do início ao fim, com rollback em caso de erro. Os mesmos 52 testes rodam nos dois bancos.

## Autenticação e autorização
- **Login:** `POST /api/v1/auth/login` com e-mail ou usuário; access token JWT de 15 minutos.
- **Refresh token:** cookie HttpOnly + SameSite=Strict (+ Secure com `COOKIE_SECURE=true`), guardado no banco só como hash SHA-256, rotacionado a cada uso. Reuso de token antigo revoga todas as sessões daquela família.
- **CSRF:** `/auth/refresh` e `/auth/logout` exigem o cabeçalho `X-Atlas-Csrf: 1` e origem da allowlist.
- **Papel:** o grupo é recarregado do banco a cada requisição; o papel do cliente ou do token não é usado.
- **Grupos:** Visualizador (leitura de cotações e envios), Operador (inclui e edita, sem excluir nem gerir usuários), Administrador (total).
- **Primeiro administrador:** somente via `npm run create-admin`, com credenciais em variáveis de ambiente. Não há usuário fixo no código nem senha no repositório.

## Segurança implementada
- Zod em todas as entradas; rotas sensíveis estritas; campos calculados/protegidos enviados pelo cliente são ignorados e recalculados.
- SQL sempre parametrizado; ordenação e colunas de filtro vêm de listas fixas.
- bcrypt com custo configurável (`BCRYPT_ROUNDS`, padrão 12); login sem enumeração de contas (mesma resposta e mesmo custo quando o usuário não existe).
- Helmet com CSP, CORS com allowlist, rate limit global e de autenticação, limite de tamanho do corpo.
- Erros em formato único, sem stack trace para o cliente; senhas, tokens e cookies mascarados nos logs.
- Auditoria: tabela `auditoria` (login, falhas de login, reuso de refresh token, usuários, exclusões) e `historico` em cada registro.
- `npm audit --omit=dev`: 0 vulnerabilidades na data da entrega.

## Testes
```bash
npm run typecheck
npm run build
npm test                    # SQLite em memória
MYSQL_HOST=127.0.0.1 MYSQL_USER=atlas MYSQL_PASSWORD=... MYSQL_DATABASE=atlas_test npm run test:mysql
# Ponta a ponta (navegador real), com a API rodando e um admin criado:
pip install playwright && playwright install chromium
ATLAS_URL=http://127.0.0.1:3333 ATLAS_ADMIN=Antony.Goiana ATLAS_ADMIN_SENHA='...' python3 tests/e2e/frontend_e2e.py
```
> O `test:mysql` **apaga todas as tabelas** do banco indicado. Use um banco exclusivo de testes.
> O teste ponta a ponta cria registros e usuários fixos: rode-o contra um banco recém-criado.

## Integração com o frontend
- `public/index.html` é o frontend ATLAS gerado a partir de `frontend/ATLAS.html` por `npm run build:frontend` (`scripts/build-frontend.py`). Se o `ATLAS.html` mudar, substitua o arquivo em `frontend/` e rode o comando de novo; o script falha se algum trecho esperado não existir.
- `public/atlas-api-client.js` substitui `window.claude.use("db"/"user"/"assets")` por HTTP mantendo a interface das telas: carga após login, atualização a cada 15 s e logo após cada gravação, renovação automática da sessão e volta ao login quando ela expira.
- Sem fallback silencioso para `localStorage`: se a API cair, a tela mostra o erro.

## Limitações e pendências
- Indicadores, Agenda e lista de Notificações ainda são calculados no navegador (mesmas fórmulas dos endpoints `/indicadores`, `/agenda`, `/notificacoes`); os painéis ainda não consomem esses endpoints.
- Imagens de rastreio ficam no próprio registro (base64, até ~2 MB). Para volumes grandes, use armazenamento de objetos.
- Sincronização por consulta periódica (15 s), não em tempo real.
- Filtro de status de envios calculado em memória (depende de dias úteis).
- Docker não executado no ambiente de desenvolvimento.
- Fastify 5.12.7 e plugins foram fixados nas versões que corrigem vulnerabilidades; algumas são recentes. Revise as atualizações antes de implantar.
