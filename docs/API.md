# ATLAS API — referência dos endpoints (v1)

**Base:** `/api/v1` · JSON · Autenticação: `Authorization: Bearer <accessToken>`

**Formato de erro (todas as rotas):**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos.", "details": [{ "path": "uf", "message": "..." }] } }
```

| HTTP | code | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` / `BAD_REQUEST` | entrada inválida, campo desconhecido em rotas estritas |
| 401 | `UNAUTHORIZED` | sem token, token inválido/expirado, credenciais inválidas |
| 403 | `FORBIDDEN` | grupo sem permissão, CSRF/origem inválida |
| 404 | `NOT_FOUND` | recurso ou rota inexistente |
| 409 | `CONFLICT` | unicidade (e-mail, usuário, nome/código de filial) |
| 413 | `PAYLOAD_TOO_LARGE` | corpo acima de `BODY_LIMIT_BYTES` |
| 422 | `BUSINESS_RULE` | regra de negócio (filial inativa, produto fora do cadastro, datas incoerentes, último admin) |
| 429 | `RATE_LIMITED` | limite de requisições |
| 500 | `INTERNAL_ERROR` | erro inesperado (detalhes só no log) |

**Listagens:** resposta `{ data, page, pageSize, total }`; `page` a partir de 1 e `pageSize` de 1 a 1000. Filtros vêm de listas fixas; nenhum parâmetro é concatenado ao SQL.

## Permissões

| Recurso | Visualizador | Operador | Administrador |
|---|---|---|---|
| cotacoes, envios | ler | ler, criar, editar | tudo |
| coletas, produtos, filiais | — | ler, criar, editar | tudo |
| notificacoes, indicadores, agenda | — | ler | ler |
| usuarios | só `/usuarios/nomes` | só `/usuarios/nomes` | tudo |

Excluir observações (PATCH com `null` ou PUT sem a chave) também exige administrador.

## Autenticação — `/auth`

| Método e rota | Descrição |
|---|---|
| `POST /auth/login` | `{ login, senha }` (`login` = e-mail ou usuário). 200 `{ accessToken, tokenType, expiresIn, usuario }` + cookie `atlas_rt` (HttpOnly, SameSite=Strict, Path=/api/v1/auth). |
| `POST /auth/refresh` | Usa o cookie; exige `X-Atlas-Csrf: 1`. Novo access token e rotação do refresh token. Reuso de token já rotacionado revoga toda a família. |
| `POST /auth/logout` | Exige `X-Atlas-Csrf: 1`. Revoga a sessão de renovação; 204. |
| `GET /auth/me` | Usuário autenticado (carregado do banco). |
| `POST /auth/senha` | `{ senhaAtual, novaSenha }`. Troca a própria senha e encerra as sessões. |
| `POST /auth/register` | Exige admin, ou `PUBLIC_REGISTER=true` (aí o grupo é sempre `visualizador`). |

```bash
curl -s -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"login":"Antony.Goiana","senha":"<senha>"}' http://localhost:3333/api/v1/auth/login
curl -s -b cookies.txt -c cookies.txt -X POST -H 'X-Atlas-Csrf: 1' http://localhost:3333/api/v1/auth/refresh
```

## Usuários — `/usuarios` (admin)

| Método e rota | Descrição |
|---|---|
| `GET /usuarios?q=&grupo=&ativo=&page=&pageSize=` | Listagem paginada; nunca retorna hash. |
| `GET /usuarios/nomes` | `{ data: [{ id, usuario }] }`, qualquer autenticado (autor no histórico). |
| `GET /usuarios/:id` | Consulta. |
| `POST /usuarios` | `{ email, usuario, senha, grupo }` → 201; 409 se e-mail/usuário existir. |
| `PATCH /usuarios/:id` | `{ email?, usuario?, grupo?, ativo? }`; 422 ao rebaixar/desativar o último admin ativo ou o próprio acesso. |
| `POST /usuarios/:id/senha` | `{ novaSenha }` → 204; revoga as sessões do usuário. |
| `DELETE /usuarios/:id` | 204; não exclui o próprio usuário nem o último admin. |

## Cotações de Frete — `/cotacoes` · Coletas — `/coletas` (mesmo contrato)

| Método e rota | Descrição |
|---|---|
| `GET /cotacoes?status=andamento\|atrasada\|entregue\|entregue_atrasado&cliente=&transportadora=&uf=&filial=&periodo=embarque\|previsao&de=&ate=` | Listagem. |
| `GET /cotacoes/:id` | Consulta. |
| `POST /cotacoes` | Criação → 201. |
| `PUT /cotacoes/:id` | Substituição completa. |
| `PATCH /cotacoes/:id` | Parcial. `obs` mesclado por chave; `null` remove (somente admin). |
| `DELETE /cotacoes/:id` | 204 (somente admin; registrado na auditoria). |

```json
{
  "cliente": "10245", "pedido": "PV-58120", "filial": "SP01",
  "produtos": [{ "sku": "CMP078", "qtd": 2, "valorUnit": 508.69 }],
  "opcoes": [{ "numero": "48211", "transportadora": "Braspress", "valorFrete": 612, "prazoDias": 6 },
             { "numero": "J-7781", "transportadora": "Jamef", "valorFrete": 548.9, "prazoDias": 7 }],
  "opcaoSel": 1, "transportadora": "Jamef", "valorFrete": 548.9, "prazoDias": 7,
  "cep": "50010-000", "cidade": "Recife", "uf": "PE", "dataEmbarque": "2026-10-16",
  "rastreio": "", "entregueEm": null
}
```

**Calculado ou garantido pelo servidor:**
- `subtotal`, `valorPedido`, `pesoUnit`/`pesoTotal` (do cadastro) e `valorCatalogo` (referência). O `valorUnit` pode ser ajustado pelo operador.
- `opcaoMelhor` (menor valor; empate = menor prazo). `opcaoSel` define `transportadora`, `valorFrete`, `prazoDias`, `numeroCotacao`.
- `dataPrevista` = entrega na transportadora + prazo em dias úteis (sem fins de semana e feriados nacionais, inclusive Sexta-feira Santa).
- `criadoEm/Por`, `alteradoEm/Por`, `historico[]` com a ação ("Criação", "Marcada como entregue", "Entrega reaberta", "Observação incluída", "Rastreio atualizado", "Edição"…).
- Validações: filial cadastrada e ativa; produtos no cadastro; `entregueEm` ≥ `dataEmbarque`; rastreio http(s); imagem só como data URL png/jpeg/webp/gif.

## Envios Marketplace — `/envios`

| Método e rota | Descrição |
|---|---|
| `GET /envios?tipo=normal\|flex\|coleta&status=&cliente=&transportadora=&de=&ate=` | Listagem. |
| `GET /envios/:id` · `POST /envios` · `PUT /envios/:id` · `PATCH /envios/:id` | CRUD. |
| `DELETE /envios/:id` | 204 (somente admin). |

- **Normal e Coleta:** `dataFaturamento`, `dataLimite` (Data Limite de entrega / Previsão de Coleta) e `transportadora` obrigatórios; `dataLimite` ≥ faturamento.
- **Flex:** `dataEntrega` e `statusFlex` (`faturado`, `em_rota`, `entregue`); ao marcar `entregue`, o servidor registra `entregueEm`.
- `valorNF` calculado no servidor; status em dias úteis.

## Produtos — `/produtos`

| Método e rota | Descrição |
|---|---|
| `GET /produtos?q=&grupo=&familia=&fornecedor=` | Listagem. |
| `GET /produtos/:sku` | Consulta. |
| `PUT /produtos/:sku` | Cria (201) ou atualiza (200): `{ descricao, grupo, familia, fornecedor, valor, peso }`. |
| `POST /produtos/lote` | `{ itens: [...] }` até 5000, transação única → `{ novos, atualizados }`. |
| `DELETE /produtos/:sku` | Somente admin. |

## Filiais — `/filiais`

| Método e rota | Descrição |
|---|---|
| `GET /filiais?q=&ativa=` · `GET /filiais/:id` | Consulta. |
| `POST /filiais` | `{ nome, codigo?, ativa? }`; nome e código únicos (409). |
| `PATCH /filiais/:id` | `{ codigo?, ativa? }`; nome imutável (422). |
| `POST /filiais/lote` | Importação de planilha, tudo ou nada. |
| `DELETE /filiais/:id` | Somente admin. |

## Notificações — `/notificacoes`

| Método e rota | Descrição |
|---|---|
| `GET /notificacoes?mod=cot\|col\|env&type=prazo\|atraso&somenteNaoLidas=1&limit=` | `{ data, total, naoLidas }`. |
| `POST /notificacoes/lidas` | `{ ids, lida }`, idempotente. |
| `GET /notificacoes/leituras` · `PUT /notificacoes/leituras` | Leituras no formato `{ lidas }` do frontend. |

Geradas dos dados reais: avisos de prazo um por dia útil a partir de 5 dias úteis antes da previsão; avisos de atraso um por dia até a conclusão (limite 60). IDs determinísticos (`prazo-<id>-<data>`, `atraso-…`, `eprazo-…`, `eatraso-…`), iguais aos do frontend — sem duplicidade. Cada usuário só vê os módulos que pode ler.

## Indicadores — `/indicadores`

| Método e rota | Descrição |
|---|---|
| `GET /indicadores/cotacoes?de=&ate=&transportadora=&uf=&filial=` | Também `/indicadores/coletas`. |
| `GET /indicadores/envios?de=&ate=&tipo=&transportadora=` | Envios. |

Retorna `resumo` (n, emRota, entregues, noPrazo, comAtraso, otd, atrasadasAgora, maiorAtraso, atrasoMedio, valorPedidos, freteTotal, fretePct, ticketMedio, freteMedio), `faixa`, `anterior` (período anterior de mesma duração), `porTransportadora`, `porUF`, `porFilial` e `calculadora` (melhor preço/prazo; vitórias só em pedidos com 2+ cotações).
**OTD** = entregas concluídas até a data prevista ÷ entregas concluídas; divisor zero → `null`. Faixas: ≥ 90% verde, 70–89,9% atenção, < 70% crítico.

## Agenda — `/agenda`

`GET /agenda?de=AAAA-MM-DD&ate=AAAA-MM-DD&cat=cot,prazo,coleta,normal,flex` → eventos com `cat`, `date`, `mod`, `id`, `pedido`, `cliente`, `tipo`, `status`, `feriado`. Intervalo máximo de 400 dias; somente leitura.

## Saúde

`GET /health` → `{ status: "ok", banco: "sqlite" | "mysql", versao }`
