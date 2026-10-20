# Diagnóstico do frontend ATLAS e decisões de arquitetura

## 1. Como o frontend funcionava
- Arquivo único (`ATLAS.html`, ~480 KB) com HTML, CSS e JavaScript.
- Persistência por dois caminhos:
  - **modo compartilhado:** `window.claude.use("db")`, que só existe no ambiente de artefatos do Claude, com coleções e documentos `onSnapshot`, `add`, `set`, `update`, `delete`;
  - **modo local:** `localStorage`.
- Login próprio no navegador: hash SHA-256 com sal guardado no próprio banco compartilhado, e matriz de grupos aplicada só no cliente. Quem tinha o link conseguia ler os hashes e contornar a checagem.
- Regras de negócio (dias úteis, status, previsão, melhor opção de frete, notificações, indicadores) calculadas somente no navegador.

## 2. Mapeamento: frontend → API

| Frontend (caminho) | Conteúdo | API |
|---|---|---|
| `cotacoes/{id}` | cotação de frete (produtos, opções, rastreio, observações, entrega, histórico) | `/api/v1/cotacoes` |
| `coletas/{id}` | mesma estrutura, base separada | `/api/v1/coletas` |
| `envios/{id}` | envio marketplace (normal, flex, coleta) | `/api/v1/envios` |
| `catalogo/s00..s15` | produtos em 16 "shards" (limite de tamanho do documento) | `/api/v1/produtos` (tabela relacional) |
| `config/filiais` | mapa de filiais | `/api/v1/filiais` |
| `config/usuarios` | usuários com hash de senha no cliente | `/api/v1/usuarios` + `/api/v1/auth` |
| `data/users/{uid}/notificacoes` | leituras de notificações | `/api/v1/notificacoes/leituras` |
| (calculado no cliente) | indicadores, agenda, notificações | `/api/v1/indicadores`, `/api/v1/agenda`, `/api/v1/notificacoes` |

| Operação do frontend | Chamada HTTP |
|---|---|
| `collection(c).onSnapshot` | `GET /{c}` (todas as páginas), após login, a cada 15 s e após cada escrita |
| `collection(c).add(doc)` | `POST /{c}` |
| `doc(c/id).set(doc)` | `PUT /{c}/{id}` |
| `doc(c/id).update(parcial)` | `PATCH /{c}/{id}` |
| `doc(c/id).delete()` | `DELETE /{c}/{id}` |
| `doc("catalogo/sNN").update({itens})` | `POST /produtos/lote` / `DELETE /produtos/{sku}` |
| `doc("config/filiais").update({itens})` | `POST /filiais`, `POST /filiais/lote`, `PATCH /filiais/{id}`, `DELETE /filiais/{id}` |
| Login, cadastro de usuário, troca de senha | `/auth/login`, `POST /usuarios`, `/auth/senha`, `/usuarios/{id}/senha` |

## 3. Problemas encontrados
1. **Segurança:** autenticação e autorização só no cliente; hashes de senha legíveis por quem tinha o link; o papel (grupo) era decidido pelo navegador.
2. **Integridade:** valores calculados no navegador (valor do pedido, previsão, histórico, autor da alteração) podiam ser forjados.
3. **Acoplamento:** dependência de uma API proprietária (`window.claude.use`) e "shards" artificiais para contornar o limite de 256 KB por documento.
4. **Concorrência:** importações em lote faziam várias escritas sem transação.

## 4. Decisões
- **Contrato preservado:** a API devolve exatamente os campos usados pelo frontend (`cliente`, `pedido`, `opcoes`, `opcaoSel`, `valorFrete`, `prazoDias`, `dataEmbarque`, `entregueEm`, `statusFlex`, `historico`, `obs`, etc.), com datas `AAAA-MM-DD` e carimbos ISO 8601.
- **Persistência híbrida para cotações, coletas e envios:** colunas indexadas para filtros e relatórios, mais o documento completo em JSON (`dados`). O contrato e o histórico ficam íntegros, sem inventar um modelo relacional de "opções" que o negócio não usa separadamente. Produtos, filiais, usuários, sessões, leituras e auditoria são relacionais.
- **Cálculos no servidor:** recalculados a cada gravação — valor do pedido, subtotais, peso, valor da NF, previsão em dias úteis, melhor opção de frete, status, autor, data/hora e histórico. Campos protegidos enviados pelo cliente são ignorados. O servidor define data e autor de cada nova observação.
- **Frontend:** `public/atlas-api-client.js` implementa a mesma interface usada pelo app sobre HTTP; telas, filtros, modais e indicadores continuam iguais. Login, cadastro de usuário e troca de senha usam endpoints próprios. Sem fallback para `localStorage` quando a API está fora.
- **Matriz de permissões (servidor):** Visualizador lê cotações e envios; Operador inclui e edita, sem excluir e sem gestão de usuários; Administrador tem acesso total.
- **Primeiro administrador:** criado por linha de comando (`npm run create-admin`) com credenciais em variáveis de ambiente. Não há usuário fixo no código.
- **Cadastro (`/auth/register`):** por padrão só administradores; com `PUBLIC_REGISTER=true`, cadastro público sempre no grupo visualizador.

## 5. Incertezas documentadas
- A Agenda não tem eventos avulsos no frontend: só mostra datas dos registros. A API de agenda é somente leitura, para não inventar funcionalidade.
- Indicadores, Agenda e lista de Notificações continuam calculados no frontend, com as mesmas fórmulas dos endpoints do servidor. Ligar esses painéis à API ficou como pendência, para não alterar o visual aprovado.
- Imagens de rastreio ficam no próprio registro (data URL de até ~2 MB, com tipo validado). Não existe módulo de arquivos separado.
