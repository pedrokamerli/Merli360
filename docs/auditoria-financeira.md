# Auditoria financeira do Merli360 Gestao

Data da auditoria: 2026-07-19  
Repositorio: `C:\Users\pedro\Documents\Projeto consultoria 360`  
Objetivo: registrar o estado atual antes de evoluir o Merli360 Gestao para um SaaS financeiro multiempresa.

## Resumo executivo

O sistema atual e um monolito Next.js com Prisma e SQLite. Ele ja possui login, tenants, logs administrativos, dashboard, fluxo de caixa, contas a receber, contas a pagar, categorias, importacao CSV, clientes, notas, ads, CRM, metas, relatorios e modulos agro.

Para virar um SaaS financeiro comercializavel, os maiores gaps sao:

- valores monetarios usam `Float`;
- contas a pagar/receber ainda sao tabelas separadas e sem baixas parciais;
- a baixa altera o status do titulo e cria/atualiza uma `Transaction`, mas nao existe entidade propria de liquidacao;
- importacao bancaria grava direto em `Transaction`, sem lote bancario nem conciliacao;
- nao existe modelo formal de conta financeira com saldo inicial/data de corte;
- dashboard, carteiras e relatorios usam formulas separadas;
- menu padrao ainda contem CRM, Oferta 360, Metas MRR e Ads;
- senha usa SHA-256 simples, sem algoritmo moderno com salt/custo;
- seed principal e destrutivo e nao deve ser usado em producao;
- nao ha testes automatizados uteis hoje;
- `npm run lint` nao esta configurado e abre assistente interativo.

Nenhuma alteracao destrutiva foi feita nesta etapa.

## Stack e comandos

- Next.js: 15.5.20 no build local.
- React: 19.1.0.
- TypeScript: 5.8.3.
- Prisma: 6.11.1.
- Banco local/producao atual: SQLite.
- ORM: Prisma Client.
- CSS: Tailwind CSS 3.4.17.
- Graficos: Recharts.
- Parser CSV: PapaParse.
- Icones: lucide-react.
- Docker: existe `Dockerfile`, `docker-compose.yml` e `docker-entrypoint.sh`.

Comandos declarados em `package.json`:

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run lint`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:seed`
- `npm run db:init`

Resultado dos comandos nesta auditoria:

- `npm.cmd run build`: passou.
- `npm.cmd run lint`: falhou como validacao automatica porque `next lint` esta deprecated e iniciou wizard de configuracao ESLint.

Atualizacao apos Fase 1 parcial em 2026-07-19:

- `npm.cmd run build`: passou novamente apos limpar menu financeiro, adicionar `/contatos`, ajustar dashboard e relatorios.
- `npm.cmd run lint`: permaneceu com a mesma falha estrutural de configuracao.

Atualizacao apos Fase 2 parcial em 2026-07-19:

- backup local criado antes do schema: `backups/dev-2026-07-19-205121.db`;
- SHA-256 do backup: `EA3C9F1B118114A38B478C9729561A7C806838FBA298FFFB81E87245D9D8CE40`;
- migration aditiva criada: `prisma/migrations/20260719205100_financial_foundation/migration.sql`;
- novas tabelas locais apos sincronizacao: `FinancialAccount` 10, `CostCenter` 12, `Budget` 0, `BudgetLine` 0;
- `npm.cmd run build`: passou apos a nova fundacao financeira.

Atualizacao apos Fase 3 parcial em 2026-07-19:

- backup local criado antes dos titulos: `backups/dev-2026-07-19-205802-before-titles.db`;
- SHA-256 do backup: `2560338F023A0A794BD3A67D3882ADE7F7911965652096636CC9D723D8A2C077`;
- migration aditiva criada: `prisma/migrations/20260719205800_financial_titles_settlements/migration.sql`;
- script idempotente criado: `scripts/migrate-financial-legacy.js`;
- dry-run: 16 titulos, 0 baixas, 12 movimentos de caixa, 0 invalidos;
- execucao local: 16 titulos criados, 0 baixas criadas, 12 movimentos de caixa criados;
- totais migrados do tenant `merli360`: R$ 3.550,00 a receber, R$ 1.604,00 a pagar, R$ 3.610,00 em entradas de caixa e R$ 1.604,00 em saidas de caixa;
- `npm.cmd run build`: passou apos a nova camada paralela.

Atualizacao de integracao em 2026-07-19:

- `src/lib/financial-ledger.ts` passou a manter a nova camada em sincronia quando o usuario marca uma conta como recebida ou paga;
- `Recebi` cria/atualiza titulo, baixa e movimento de caixa na nova estrutura;
- `Pago` cria/atualiza titulo, baixa e movimento de caixa na nova estrutura;
- a camada antiga foi preservada para compatibilidade;
- `npm.cmd run build`: passou apos a integracao.

## Estrutura relevante

- `src/app`: App Router, paginas e APIs.
- `src/components`: componentes compartilhados, incluindo `EntityManager`, `Sidebar`, dashboard e relatorios.
- `src/lib`: regras de autenticacao, dashboard, relatórios, auditoria, sincronismos financeiros e rural.
- `prisma/schema.prisma`: schema atual do banco.
- `prisma/seed.ts`: seed destrutivo para ambiente inicial.
- `prisma/ensure-defaults.js`: inicializador idempotente usado para tenants, usuarios e categorias.
- `scripts/init-db.py`: inicializacao alternativa de banco.
- `docker-compose.yml`: servico `merli360_app` em `127.0.0.1:3100:3000`, volume `merli360_data`.

Nao ha `AGENTS.md` do projeto. O unico encontrado fica em `node_modules/recharts/AGENTS.md` e nao se aplica ao repositorio.

## Autenticacao e sessao

Arquivos principais:

- `src/lib/auth.ts`
- `src/middleware.ts`
- `src/app/api/login/route.ts`
- `src/app/api/logout/route.ts`

Como funciona hoje:

- cookie: `merli360_session`;
- payload: `userId` e `createdAt`;
- assinatura: HMAC SHA-256 com `AUTH_SECRET`, `BASIC_AUTH_PASSWORD` ou fallback local;
- cookie `HttpOnly`, `SameSite=Lax`, `Secure` somente em producao;
- expiracao: 30 dias;
- middleware bloqueia rotas sem cookie;
- APIs sem cookie retornam 401;
- paginas sem cookie redirecionam para `/login`;
- tenant do subdominio e inferido por `hostTenantKind`: host `agro.*` vira tenant kind `agro`, senao `consultoria`.

Riscos:

- senha usa SHA-256 simples em `hashPassword`, sem bcrypt/argon2/scrypt;
- sessao nao tem revogacao no banco;
- `createdAt` da sessao nao e validado para expirar do lado servidor;
- nao ha rate limit de login;
- nao ha recuperacao de senha;
- nao ha CSRF explicito para mutacoes;
- role e simples string (`admin`/`user`), sem matriz granular.

## Tenants e isolamento

Modelos principais:

- `Tenant`
- `User`

O backend usa `requireUser`/`requireApiUser` para obter o usuario pela sessao. Rotas genericas usam `tenantId` do usuario e nao confiam no frontend para escopo.

Pontos positivos:

- `GET`, `POST`, `PUT`, `DELETE` em `/api/[model]` aplicam `tenantId` para a maioria dos modelos.
- endpoints de baixa buscam o registro por `id` + `tenantId`.
- relatorios usam `tenantId` do usuario.
- logs de admin em `/api/logs` sao filtrados por tenant.

Riscos:

- alguns modelos antigos permitem `tenantId String?`, o que aumenta risco de dado orfao.
- `ServicePlan` nao tem tenant.
- `MonthlySummary` nao tem tenant.
- nao existem testes automatizados de isolamento.
- relacoes antigas ainda usam `Client` como cliente/contrato, nao uma entidade ampla de contato.

## Modelos atuais

Tabelas/modelos encontrados:

- `Tenant`
- `User`
- `AuditLog`
- `Client`
- `Transaction`
- `Category`
- `Invoice`
- `AdBudget`
- `AccountReceivable`
- `AccountPayable`
- `Goal`
- `Lead`
- `ServicePlan`
- `MonthlySummary`
- `Buyer`
- `Product`
- `Planting`
- `Harvest`
- `StockMovement`
- `Sale`
- `AgendaEvent`

Observacoes tecnicas:

- valores financeiros e quantidades usam `Float`.
- IDs usam `cuid()`.
- algumas entidades de negocio ainda possuem `tenantId` opcional.
- nao ha indices explicitos para consultas financeiras.
- nao ha modelo de `FinancialAccount`, `Settlement`, `CashMovement`, `BankImportBatch`, `BankTransaction`, `ReconciliationGroup`, `Budget` ou `BudgetLine`.
- nao ha modelo de anexo privado.

## Rotas e endpoints

APIs principais:

- `POST /api/login`
- `POST /api/logout`
- `GET/POST/PUT/DELETE /api/[model]`
- `POST /api/receivables/mark-paid`
- `POST /api/payables/mark-paid`
- `POST /api/generate-receivables`
- `POST /api/import`
- `GET /api/export/[model]`
- `GET /api/report-data/[model]`
- `GET /api/logs`

Modelos expostos pela API generica:

- transactions
- clients
- categories
- invoices
- adBudgets
- receivables
- payables
- goals
- leads
- servicePlans
- buyers
- products
- plantings
- harvests
- stockMovements
- sales
- agendaEvents

Riscos:

- validacao de payload e majoritariamente manual, sem Zod nas rotas financeiras.
- mutacoes genericas permitem alteracao ampla dos campos do modelo.
- nao ha paginacao no servidor.
- nao ha idempotency key dedicada nas acoes criticas, embora algumas automacoes usem `importHash`.

## Paginas, componentes e navegacao

Paginas atuais:

- `/`
- `/fluxo`
- `/clientes`
- `/receber`
- `/pagar`
- `/notas`
- `/ads`
- `/metas`
- `/crm`
- `/categorias`
- `/importar`
- `/oferta-360`
- `/relatorios`
- `/relatorios/ads-cliente`
- `/logs`
- modulos agro: `/vendas`, `/compradores`, `/produtos`, `/plantios`, `/colheitas`, `/estoque`, `/agenda`

Componente central de CRUD:

- `src/components/EntityManager.tsx`

Menu atual:

- consultoria: dashboard, fluxo, clientes, receber, pagar, notas, ads, metas, CRM, categorias, importar, Oferta 360, relatorios, logs para admin.
- agro: dashboard, fluxo, vendas, compradores, receber, pagar, produtos, plantios, colheitas, estoque, agenda, categorias, relatorios, logs para admin.

Gap para o novo produto financeiro:

- menu padrao ainda possui CRM, Oferta 360, Metas MRR e Ads.
- nao existe Conciliaçao bancaria, Contas financeiras, Orcamento ou Configuracoes financeiras.
- `Clientes` ainda nao virou `Contatos`.

## Dashboard e formulas atuais

Arquivo principal:

- `src/lib/dashboard.ts`

Calculos atuais:

- receita total recebida = soma das `Transaction` do mes com `type = entrada`.
- despesas pagas = soma das `Transaction` do mes com `type = saida`.
- saldo/lucro do mes = entradas menos saidas.
- contas a receber = soma de `AccountReceivable` do mes por vencimento com status diferente de `pago`.
- contas a pagar = soma de `AccountPayable` do mes por vencimento com status diferente de `pago`.
- carteiras = `src/lib/wallets.ts`, soma transacoes com status `pago`, `realizado` ou `recebido` por campo textual `account`.
- ads = soma campos de `AdBudget`.
- consultoria ainda mostra MRR, metas e ads.

Riscos:

- dashboard e relatorios nao usam uma camada unica de calculo.
- saldos por conta nao possuem saldo inicial nem data de corte.
- transferencias nao sao modeladas separadamente.
- previsao e realizado sao misturados a partir de tabelas legadas.

## Contas a receber, pagar e baixas

Arquivos:

- `src/app/api/receivables/mark-paid/route.ts`
- `src/app/api/payables/mark-paid/route.ts`
- `src/lib/transaction-sync.ts`
- `src/app/api/generate-receivables/route.ts`

Como funciona:

- `Recebi` exige id, conta, forma de pagamento e data.
- atualiza `AccountReceivable.status = pago` e `paidDate`.
- cria/atualiza uma `Transaction` com `importHash = receivable-paid-{id}`.
- `Pago` faz o mesmo para `AccountPayable`, gerando `payable-paid-{id}`.
- recorrencias de recebiveis geram novos recebiveis por mes, semanal, quinzenal ou mensal.
- clientes recorrentes tambem geram mensalidades.

Limites:

- nao existe baixa parcial.
- nao existe baixa com juros, multa, desconto, tarifa ou abatimento.
- nao existe estorno.
- nao existe transacao de banco separada da movimentacao do sistema.
- acao repetida tende a nao duplicar a `Transaction` por causa do `importHash`, mas nao ha idempotencia formal de request.
- status de vencido e parcialmente derivado na UI/relatorio, mas tambem existe `status` persistido.

## Importacao CSV

Arquivo:

- `src/app/api/import/route.ts`

Funcionalidade atual:

- aceita CSV por upload.
- tenta UTF-8 e latin1.
- detecta delimitador por contagem de `;` versus `,`.
- detecta colunas por nomes provaveis.
- trata valores brasileiros.
- gera preview quando `confirm` nao e `true`.
- confirma com `createMany` em `Transaction`.
- deduplica por `importHash = tenantId|hash(data, descricao, valor absoluto)`.
- categoriza automaticamente termos de ads e ferramentas.

Limites:

- nao aceita OFX.
- nao tem assistente de mapeamento manual.
- nao cria lote de importacao.
- nao guarda transacao bancaria separada.
- nao existe conciliacao.
- deduplicacao por data/descricao/valor pode bloquear lancamentos legitimos iguais.
- regras sao especificas da operacao de consultoria e devem sair do produto financeiro padrao.

## Relatorios e exportacao

Arquivos:

- `src/lib/reports.ts`
- `src/app/api/report-data/[model]/route.ts`
- `src/app/api/export/[model]/route.ts`
- `src/components/ReportExplorer.tsx`

Funcionalidade atual:

- relatorios para fluxo, clientes, ads, receber, pagar, notas, metas e leads.
- filtros simples por mes e status.
- exportacao CSV com `;` e BOM UTF-8.
- tela e export usam a mesma fonte `getReportRows` para cada modelo.

Gaps:

- nao ha XLSX.
- nao ha PDF.
- nao ha fluxo projetado, DRE Gerencial, aging, orcado versus realizado, extrato por conta ou conciliacao bancaria.
- exportacao nao aplica protecao contra formula injection.
- relatorios ainda incluem Ads, Metas e CRM.

## Arquivos e comprovantes

Campos atuais:

- `Transaction.attachmentUrl`
- `Invoice.fileUrl`
- `AdBudget.proofUrl`

Nao ha upload privado implementado, armazenamento externo, autorizacao por arquivo, limite de tamanho, assinatura temporaria ou retencao.

## Logs e auditoria

Modelo:

- `AuditLog`

Arquivo:

- `src/lib/audit.ts`

Cobertura atual:

- login com sucesso/falha.
- bloqueio por tenant errado.
- logout.
- create/update/delete na API generica.
- importacao CSV confirmada.
- gerar recorrencias.
- marcar conta recebida/paga.

Riscos:

- metadata pode guardar payload financeiro inteiro.
- nao ha before/after controlado.
- nao ha correlation/request ID.
- nao ha mascara formal de dados sensiveis.

## Docker, banco, backup e deploy

Docker atual:

- servico: `merli360_app`.
- porta: `127.0.0.1:3100:3000`.
- banco: `DATABASE_URL=file:/app/data/dev.db`.
- volume persistente: `merli360_data:/app/data`.
- entrypoint roda `npx prisma db push`, `npx prisma generate` e `node prisma/ensure-defaults.js`.

Riscos:

- `db push` em producao nao e ideal para um SaaS comercial; o alvo deve ser migrations versionadas.
- nao ha healthcheck no compose.
- nao ha backup automatizado documentado no repo para VPS.
- SQLite e aceitavel para MVP local, mas e gargalo para SaaS comercial multiempresa.
- `prisma/seed.ts` apaga dados e nao deve ser usado em producao.

## Modulos especificos de marketing a remover do produto padrao

Devem ser ocultados por feature flag/configuracao e preservados como legado:

- Ads e relatorio de Ads.
- Metas MRR.
- Pipeline/CRM.
- Oferta 360.
- Notas como controle de servico da consultoria, ate reavaliar escopo financeiro.
- Regras automaticas de Meta/Facebook, Canva, OpenAI, CapCut e operacao pessoal.

## Linha de base local

Gerada em: 2026-07-19T23:39:51.808Z.

Contagem por tabela:

| Tabela | Quantidade |
| --- | ---: |
| Tenant | 2 |
| User | 3 |
| AuditLog | 4 |
| Client | 7 |
| Transaction | 12 |
| Category | 47 |
| Invoice | 7 |
| AdBudget | 1 |
| AccountReceivable | 7 |
| AccountPayable | 9 |
| Goal | 4 |
| Lead | 1 |
| ServicePlan | 3 |
| MonthlySummary | 0 |
| Buyer | 0 |
| Product | 0 |
| Planting | 0 |
| Harvest | 0 |
| StockMovement | 0 |
| Sale | 0 |
| AgendaEvent | 0 |

Tenant `gestao-rural-360`:

- kind: `agro`.
- transacoes: nenhuma no banco local.
- recebiveis: 0.
- pagaveis: 0.
- checksum: `e36a393d8d02edefc139844a9c601beb25414f471a381631e050f1a4f6a51899`.

Tenant `merli360`:

- kind: `consultoria`.
- julho/2026: entradas R$ 3.610,00; saidas R$ 1.604,00; saldo R$ 2.006,00; 12 transacoes.
- saldo por conta realizado: PJ com entradas R$ 60,00; saidas R$ 0,00; saldo R$ 60,00; 1 transacao.
- recebiveis: 7; aberto R$ 3.550,00; recebido R$ 0,00; vencido R$ 3.550,00.
- pagaveis: 9; aberto R$ 1.604,00; pago R$ 0,00; vencido R$ 744,00.
- checksum: `e7c668f9db218d6413c843aae0e6bb266e6627bb9fbc8168928f68365e683a64`.

Observacao: esta linha de base e do banco local atual. Antes de qualquer migracao em VPS, gerar backup e linha de base diretamente do volume de producao.

## Dados a preservar

- tenants e usuarios.
- clientes/contratos existentes.
- transacoes financeiras.
- contas a receber e pagar.
- categorias.
- notas, ads, metas, leads e service plans como legado exportavel.
- logs de auditoria.
- dados agro em tenants agro.

## Riscos classificados

### Critico

- Uso de `Float` para dinheiro.
- Ausencia de entidade de baixa/liquidacao e estorno.
- Importacao grava direto no fluxo, impedindo conciliacao bancaria correta.
- Seed principal destrutivo.

### Alto

- Senhas com SHA-256 simples.
- Sem testes de isolamento entre tenants.
- Sem modelo formal de conta financeira/saldo inicial.
- `db push` em producao.
- Sem backup automatizado/restore testado documentado.
- Sem validacao forte de payload nas rotas financeiras.

### Medio

- Menu e relatorios misturam produto financeiro com modulos da consultoria.
- Relatorios sem XLSX/PDF e sem formula injection guard.
- Sem paginacao no servidor.
- Sem healthcheck Docker.
- Logs podem conter payloads amplos.

### Baixo

- README desatualizado: ainda fala "sem login nesta versao" e Basic Auth.
- Codificacao de textos antigos aparece com mojibake em alguns arquivos.
- Labels e nomes ainda misturam Merli360, consultoria e Agro.

## Estrategia de compatibilidade

1. Nao remover tabelas legadas.
2. Criar novas tabelas financeiras em paralelo.
3. Criar views/camada de leitura que consolide legado e novo modelo.
4. Migrar por script idempotente, com modo dry-run.
5. Manter IDs legados em campos `legacyId` ou tabela de mapeamento.
6. Validar contagens, totais por tenant/mes/conta e checksums antes/depois.
7. So trocar dashboard e relatorios para a nova camada quando os totais baterem.
8. Ocultar modulos de marketing por feature flag antes de qualquer remocao fisica.
