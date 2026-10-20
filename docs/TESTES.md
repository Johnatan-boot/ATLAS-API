# Resultados reais das verificações

Executado em 18/10/2026, Node.js 22.22.0, MySQL 8.0.46 (instalado no ambiente de teste). Log completo em [`verificacao-resultados.log`](verificacao-resultados.log).

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos (TypeScript estrito) | `npm run typecheck` | sem erros |
| Compilação | `npm run build` | sem erros |
| Testes com SQLite (em memória) | `npm test` | **52 de 52 passaram** |
| Testes com MySQL 8.0.46 | `npm run test:mysql` | **52 de 52 passaram** |
| Migrations pela linha de comando | `npm run migrate` (2 vezes) | 1ª: `001_init` aplicada; 2ª: nenhuma pendente |
| Dependências | `npm audit --omit=dev` | 0 vulnerabilidades |
| Ponta a ponta, navegador real + SQLite | `tests/e2e/frontend_e2e.py` | **16 de 16 fluxos OK** ([log](e2e-sqlite.log)) |
| Ponta a ponta, navegador real + MySQL | `tests/e2e/frontend_e2e.py` | **16 de 16 fluxos OK** ([log](e2e-mysql.log)) |
| Docker / Docker Compose | — | **não executado** (sem Docker no ambiente) |

## Testes automatizados (os mesmos 52 nos dois bancos)

Arquivos: `tests/regras.test.ts`, `auth.test.ts`, `usuarios.test.ts`, `cotacoes.test.ts`, `cadastros.test.ts`, `envios.test.ts`, `paineis.test.ts`, `infra.test.ts`.

- login por usuário e por e-mail retorna access token e cookie HttpOnly
- credenciais inválidas e usuário inexistente têm a mesma resposta
- login com corpo inválido retorna 400
- senha é armazenada com hash bcrypt
- token ausente, inválido, expirado ou de outro emissor é recusado
- o papel vem do banco, não do token
- refresh rotaciona o token; reuso do antigo revoga a família inteira
- refresh exige cabeçalho anti-CSRF e origem permitida
- logout invalida a sessão de renovação
- usuário desativado não acessa nem renova
- cadastro público desativado; admin cadastra; operador não
- troca da própria senha exige a senha atual e encerra sessões
- cadastro público, quando habilitado, nunca concede privilégios
- limitação de tentativas de login retorna 429
- produtos: upsert idempotente, busca, filtros e exclusão somente admin
- produtos: importação em lote atualiza SKUs existentes
- filiais: unicidade de nome e código, nome imutável, desativação
- filiais: lote é tudo ou nada (rollback em conflito)
- servidor recalcula valores, previsão e melhor opção; preserva o contrato do frontend
- escolha manual de outra opção é respeitada
- validações de entrada e de domínio
- permissões: visualizador só lê; operador não exclui; admin exclui
- entrega, reabertura e histórico com ações
- observações: data/autor definidos pelo servidor; exclusão só para admin
- filtros por status e paginação
- coletas usam a mesma regra em base separada
- transação: falha no meio não grava nada
- Envio Normal: valor da NF calculado e validações de datas
- Flex: status e data de entrega; Entregue registra a data
- filtro de status calculado em dias úteis e permissões
- API inicia e o health check consulta o banco
- migrations são reproduzíveis e não reaplicam
- integridade referencial: token de sessão exige usuário existente
- cabeçalhos de segurança, erro padronizado e rota inexistente
- CORS só libera origens da allowlist
- limite de tamanho do corpo
- notificações são geradas dos dados reais, sem duplicidade, com controle de leitura
- indicadores calculados no servidor, sem divisão por zero
- agenda lista eventos do intervalo e respeita permissões
- dias úteis pulam fim de semana e feriados nacionais
- Sexta-feira Santa é feriado móvel
- businessDaysUntil conta dias úteis após a data inicial
- datas inválidas são rejeitadas
- status de cotação: andamento, atrasada, entregue e entregue atrasado
- status de envio usa dias úteis e status do Flex
- melhor opção: menor valor e, no empate, menor prazo
- somente admin lista usuários; resposta nunca expõe hash
- qualquer autenticado consulta apenas os nomes (para o histórico)
- criar, conflito de unicidade e validação
- proteções do último administrador e do próprio acesso
- trocar grupo, redefinir senha e excluir
- exclusões ficam na trilha de auditoria

## Fluxos ponta a ponta (frontend real servido pela API)
1. Login com senha errada é recusado.
2. Login do administrador.
3. Cotação criada pela tela e gravada na API.
4. Servidor escolhe a opção mais barata (Jamef) e calcula o pedido (R$ 1.017,38).
5. Histórico com autor e ação.
6. Marcar como entregue grava no servidor.
7. Observação gravada com data do servidor.
8. Produto criado pela tela.
9. Usuário criado pela tela (hash da senha no servidor).
10. Envio Flex criado pela tela.
11. Sair bloqueia o sistema.
12. Operador não vê botões de excluir.
13. Recarregar a página pede login.
14. Visualizador vê só Acompanhar cotações e Acompanhar envios.
15. Visualizador lê as cotações vindas da API.
16. Nenhum erro de JavaScript.

## Defeitos encontrados e corrigidos durante os testes
- **Reuso de refresh token:** a revogação da família era desfeita junto com o erro (rollback). Corrigido: a transação devolve o resultado e o erro é lançado depois do commit.
- **Fastify 4:** `npm audit` apontou vulnerabilidades de severidade alta. Atualizado para Fastify 5.12.7 e plugins corrigidos; todos os testes repetidos.

- **Script de teste ponta a ponta (ambiente):** na segunda rodada contra o MySQL, o banco de teste não tinha sido recriado (o comando de limpeza herdava `MYSQL_HOST` e o root foi recusado por TCP), e o teste falhou ao recriar usuários já existentes. Corrigido o script de preparação; com banco limpo, os 16 fluxos passaram.

## Como reproduzir o MySQL
```bash
mysql -uroot -e "CREATE DATABASE atlas_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'atlas'@'localhost' IDENTIFIED BY '<senha>'; GRANT ALL ON atlas_test.* TO 'atlas'@'localhost';"
MYSQL_HOST=127.0.0.1 MYSQL_USER=atlas MYSQL_PASSWORD='<senha>' MYSQL_DATABASE=atlas_test npm run test:mysql
```
