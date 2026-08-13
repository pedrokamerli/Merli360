# Plano de migracao financeira do Merli360 Gestao

Data: 2026-07-19  
Escopo: evoluir o Merli360 Gestao para SaaS financeiro multiempresa sem perda de dados.

## Principios

- Nao apagar dados legados.
- Nao executar reset de banco.
- Toda mudanca financeira deve ser comparavel com a linha de base.
- Toda operacao composta deve usar transacao de banco.
- Dinheiro deve sair de `Float` para centavos inteiros ou Decimal antes de uso comercial amplo.
- Tenant vem da sessao no backend, nunca do frontend.
- Modulos de consultoria devem ser ocultados, nao removidos fisicamente nesta fase.

## Fase 0 - Auditoria e linha de base

Status: concluida localmente em 2026-07-19.

Entregaveis:

- `docs/auditoria-financeira.md`.
- contagens por tabela.
- totais por tenant/mes.
- saldos por conta.
- totais abertos/pagos/vencidos.
- checksums por tenant.
- resultado de `npm.cmd run build` e `npm.cmd run lint`.

Pendencia antes de producao:

- gerar backup e linha de base diretamente na VPS antes de qualquer migration.

## Fase 1 - Escopo e navegacao do produto financeiro

Status: parcialmente implementada localmente em 2026-07-19.

Objetivo: transformar a experiencia padrao em produto financeiro simples.

Mudancas:

- criar feature flags por tenant/produto.
- menu financeiro padrao:
  1. Visao geral
  2. Movimentacoes
  3. Contas a receber
  4. Contas a pagar
  5. Conciliacao bancaria
  6. Contas financeiras
  7. Contatos
  8. Categorias e centros de custo
  9. Orcamento
  10. Relatorios
  11. Configuracoes
- ocultar no produto financeiro padrao:
  - CRM;
  - Oferta 360;
  - Metas MRR;
  - Ads;
  - relatorio de Ads;
  - indicadores e textos da consultoria.

Compatibilidade:

- manter dados e rotas legadas acessiveis somente por flag/admin.
- nao apagar registros.

Validacao:

- usuario Merli360 ve menu financeiro.
- tenant Agro continua vendo menu Agro.
- URLs legadas protegidas continuam respeitando tenant.

Implementado nesta primeira fatia:

- menu da consultoria removendo Ads, Metas, CRM, Notas e Oferta 360;
- novo caminho principal `/contatos`, mantendo `/clientes` como compatibilidade;
- rÃ³tulos de `Clientes` trocados para `Contatos e Contratos` na UI;
- cards da tela de contatos agora filtram por tenant logado;
- dashboard padrao substituiu MRR, metas e Ads por saldo consolidado, entradas, saidas, resultado, vencidos e projecao 30/60/90 dias;
- relatorios padrao removeram Ads, Metas e CRM do seletor e das exportacoes rapidas.

Validacao executada apos a fatia:

- `npm.cmd run build`: passou.
- `npm.cmd run lint`: continua bloqueado pela falta de configuracao ESLint; o comando inicia o wizard deprecated do Next.

## Fase 2 - Modelo financeiro base em paralelo

Status: parcialmente implementada localmente em 2026-07-19.

Objetivo: criar fonte unica de verdade sem quebrar o legado.

Novas entidades propostas:

- `FinancialAccount` - implementado.
- `Contact` - pendente; UI usa `/contatos`, ainda sobre tabela legada `Client`.
- `CostCenter` - implementado.
- `CategoryGroup`
- `FinancialTitle`
- `Settlement`
- `SettlementAdjustment`
- `CashMovement`
- `Transfer`
- `Budget` - implementado.
- `BudgetLine` - implementado.
- `BankImportBatch`
- `BankTransaction`
- `ReconciliationGroup`
- `ReconciliationAllocation`
- `Attachment`

Campos obrigatorios em entidades de negocio:

- `tenantId` obrigatorio.
- `createdAt`, `updatedAt`.
- `createdBy`, quando aplicavel.
- `version` para concorrencia, quando o fluxo exigir.

Decisao monetaria recomendada:

- usar centavos inteiros (`Int`) no SQLite atual e manter compatibilidade com PostgreSQL.
- futuramente, em PostgreSQL, pode migrar para `Decimal`, mas centavos inteiros reduzem ambiguidade.

Migration segura:

1. Criar tabelas novas sem alterar as antigas.
2. Criar indices por `tenantId`, datas, status, conta, contato e categoria.
3. Criar campos `legacyModel` e `legacyId` quando a entidade vier do legado.
4. Rodar script dry-run.
5. Rodar script de migracao idempotente.
6. Comparar linha de base.

Rollback:

- como tabelas legadas permanecem intactas, rollback inicial e voltar a UI para os modelos antigos.
- migrations devem evitar `DROP COLUMN` ou transformacoes irreversiveis nesta fase.

Implementado nesta fatia:

- migration aditiva `prisma/migrations/20260719205100_financial_foundation/migration.sql`;
- modelos Prisma `FinancialAccount`, `CostCenter`, `Budget` e `BudgetLine`;
- valores novos de dinheiro em centavos inteiros nos campos `initialBalanceCents`, `observedBalanceCents` e `budgetedCents`;
- CRUD generico para `financialAccounts`, `costCenters`, `budgets` e `budgetLines`;
- tela `/contas-financeiras`;
- tela `/orcamento`;
- pagina `/categorias` agora gerencia categorias e centros de custo;
- `ensure-defaults.js` cria contas e centros padrao de forma idempotente;
- `.gitignore` passa a ignorar backups locais `backups/*.db`.

Backup local antes da mudanca:

- arquivo: `backups/dev-2026-07-19-205121.db`;
- SHA-256: `EA3C9F1B118114A38B478C9729561A7C806838FBA298FFFB81E87245D9D8CE40`;
- tamanho: 229376 bytes.

Contagem apos `db push` e `ensure-defaults.js`:

- `FinancialAccount`: 10;
- `CostCenter`: 12;
- `Budget`: 0;
- `BudgetLine`: 0.

Validacao:

- `npx.cmd prisma format`: passou.
- `npx.cmd prisma db push`: passou.
- `node prisma/ensure-defaults.js`: passou.
- `npm.cmd run build`: passou.

## Fase 3 - Migracao logica dos dados legados

Status: parcialmente implementada localmente em 2026-07-19.

Mapeamento proposto:

- `Client` -> `Contact` com tipo `cliente`.
- fornecedores ainda nao existem formalmente; criar pelo uso em contas a pagar quando necessario.
- `AccountReceivable` -> `FinancialTitle` tipo `RECEIVABLE`.
- `AccountPayable` -> `FinancialTitle` tipo `PAYABLE`.
- `Transaction` paga/realizada/recebida -> `CashMovement`.
- `Category` -> `Category` nova ou manter e adicionar classificacao/DRE.
- `Goal` -> legado/exportavel; substituir por `Budget`.
- `AdBudget`, `Lead`, `ServicePlan` -> legado, oculto no financeiro padrao.

Script de migracao:

- `--dry-run`.
- relatorio de criados, ignorados, invalidos e conflitos.
- idempotencia por `legacyModel + legacyId + tenantId`.
- nenhuma exclusao automatica.
- totais por tenant/mes/conta antes/depois.
- salvar relatorio em `docs/migration-runs/` ou pasta operacional equivalente.

Implementado nesta fatia:

- modelos Prisma `FinancialTitle`, `Settlement` e `CashMovement`;
- migration aditiva `prisma/migrations/20260719205800_financial_titles_settlements/migration.sql`;
- rota/tela `/titulos` para visualizar titulos, baixas e movimentos da nova camada paralela;
- API generica exposta para `financialTitles`, `settlements` e `cashMovements`;
- script idempotente `scripts/migrate-financial-legacy.js`;
- modo de simulacao: `node scripts/migrate-financial-legacy.js --dry-run`;
- execucao real: `node scripts/migrate-financial-legacy.js`;
- origem legada preservada por `legacyModel` e `legacyId`;
- nenhuma exclusao ou alteracao das tabelas legadas.

Backup local antes da fatia:

- arquivo: `backups/dev-2026-07-19-205802-before-titles.db`;
- SHA-256: `2560338F023A0A794BD3A67D3882ADE7F7911965652096636CC9D723D8A2C077`;
- tamanho: 299008 bytes.

Resultado do dry-run:

- `FinancialTitle`: criaria 16;
- `Settlement`: criaria 0;
- `CashMovement`: criaria 12;
- invalidos: 0;
- pulados: 0.

Resultado da execucao real local:

- `FinancialTitle`: 16 criados;
- `Settlement`: 0 criados, pois nao havia recebiveis/pagaveis pagos no banco local;
- `CashMovement`: 12 criados;
- invalidos: 0.

Totais migrados do tenant `merli360`:

- titulos a receber: R$ 3.550,00;
- titulos a pagar: R$ 1.604,00;
- movimentos de entrada: R$ 3.610,00;
- movimentos de saida: R$ 1.604,00.

Validacao:

- `npx.cmd prisma format`: passou;
- `npx.cmd prisma db push`: passou;
- `node scripts/migrate-financial-legacy.js --dry-run`: passou;
- `node scripts/migrate-financial-legacy.js`: passou;
- `npm.cmd run build`: passou.

Atualizacao de integracao em 2026-07-19:

- criado `src/lib/financial-ledger.ts`;
- `syncReceivablePayment` agora tambem sincroniza `FinancialTitle`, `Settlement` e `CashMovement`;
- `syncPayablePayment` agora tambem sincroniza `FinancialTitle`, `Settlement` e `CashMovement`;
- a UI legada de `Recebi` e `Pago` continua funcionando, mas passa a alimentar a nova camada paralela;
- build executado apos a integracao: `npm.cmd run build` passou.

Bloqueios que exigem decisao:

- contato sem nome.
- titulo com valor negativo ou zero.
- data financeira invalida.
- transacao sem tenant.
- categoria inexistente sem regra de fallback.

## Fase 4 - Baixas, movimentos e transferencias

Status: primeira fatia implementada localmente em 2026-07-19.

Objetivo: corrigir a regra financeira central.

Implementar:

- baixa parcial e total - implementado em `/titulos`.
- ajustes: juros, multa, desconto, tarifa e abatimento - implementado na baixa manual.
- bloqueio de baixa excedente - implementado no backend.
- estorno auditavel - implementado no backend e na tela `/titulos`.
- uma baixa valida gera exatamente um `CashMovement` - implementado por `settlementId` unico.
- transferencias com duas pernas e efeito zero no consolidado.
- idempotency key nas acoes `Recebi`, `Pago` e transferencia.

Validacao:

- duas baixas parciais quitam exatamente o titulo - coberto pela regra de saldo aberto.
- clique repetido nao duplica caixa - garantido para a baixa manual por `settlementId` unico no movimento.
- estorno reabre saldo - implementado recalculando `FinancialTitle.status`.
- transferencia altera contas individuais e zera no consolidado - implementado em `/transferencias`.

Implementado nesta fatia:

- `settleFinancialTitle` em `src/lib/financial-ledger.ts`;
- `reverseSettlement` em `src/lib/financial-ledger.ts`;
- endpoint `POST /api/financial-titles/settle`;
- endpoint `POST /api/settlements/reverse`;
- tela operacional `src/components/FinancialTitlesWorkspace.tsx`;
- dashboard passa a usar saldo aberto dos titulos `OPEN` e `PARTIAL`, descontando baixas, descontos e abatimentos ativos;
- se estornar baixa criada pelo fluxo legado `Recebi`/`Pago`, o sistema reabre o recebivel/pagavel legado e remove o lancamento automatico antigo;
- `npm.cmd run build`: passou.

Pendencias da fase:

- idempotency key formal nos botoes legados `Recebi` e `Pago`;
- validacao automatizada cobrindo duas baixas parciais e estorno.

Atualizacao de transferencias em 2026-07-19:

- criado modelo `Transfer`;
- criada migration aditiva `prisma/migrations/20260720003500_transfers/migration.sql`;
- criada lib `src/lib/transfers.ts`;
- criado endpoint `GET/POST/DELETE /api/transfers`;
- criada tela `/transferencias`;
- menu da consultoria e menu Agro passam a exibir Transferencias;
- cada transferencia cria exatamente dois `CashMovement`: uma saida na conta origem e uma entrada na conta destino;
- `CashMovement.source = TRANSFER` fica fora de receita/despesa do dashboard, mas continua alterando saldos das carteiras;
- estorno da transferencia muda `Transfer.status` para `REVERSED` e estorna as duas pernas do caixa;
- teste local com `tsx`: criou 2 movimentos ativos, estornou 2 movimentos e limpou o registro de teste;`r`n- teste na VPS via `POST /api/transfers` e `DELETE /api/transfers`: criou, estornou e limpou transferencia de teste com 2 movimentos;
- `npm.cmd run build`: passou.

## Fase 5 - Importacao e conciliacao bancaria

Status: primeira leva implementada em 2026-07-19.

Objetivo: separar evidencia bancaria de movimento do sistema.

Implementar:

- upload CSV - implementado.
- upload OFX - pendente.
- `BankImportBatch` - implementado.
- `BankTransaction` - implementado.
- checksum de arquivo.
- deduplicacao por FITID quando houver.
- fingerprint como suspeita, nao bloqueio absoluto.
- preview com validos, invalidos e suspeitos.
- central de conciliacao:
  - 1:1;
  - 1:N;
  - N:1;
  - desfazer conciliacao.

Rollback:

- import batches podem ser cancelados se nao conciliados.
- conciliacoes so podem ser desfeitas com auditoria.

Implementado nesta leva:

- modelo `BankImportBatch`;
- modelo `BankTransaction`;
- modelo `ReconciliationGroup`;
- modelo `ReconciliationAllocation`;
- migration `prisma/migrations/20260720005000_bank_import_reconciliation/migration.sql`;
- importacao CSV agora cria lote bancario rastreavel;
- importacao CSV cria `BankTransaction`, `Transaction` legado e `CashMovement` com `source = IMPORT`;
- deduplicacao por fingerprint `tenantId + data + descricao + valor`;
- tela `/conciliacao`;
- endpoint `POST /api/bank-transactions/status`;
- linha bancaria pode ser marcada como `REVIEWED`;
- linha bancaria pode ser estornada, marcando o `CashMovement` como `REVERSED` e a `Transaction` legada como `cancelado`;
- menu da consultoria e Agro passam a exibir Conciliacao;
- tela de importacao permite selecionar conta do extrato.

## Fase 6 - Dashboard e relatorios

Status: primeira leva implementada em 2026-07-19.

Objetivo: criar camada unica de calculo.

Nova camada:

- `src/lib/finance-calculations.ts` - pendente como arquivo separado.
- dashboard, listagens, relatorios e exports ja usam parcialmente a nova camada `CashMovement`, `FinancialTitle`, `Transfer` e `BankTransaction`.

Dashboard financeiro:

- saldo consolidado.
- saldo por conta.
- entradas realizadas.
- saidas realizadas.
- resultado de caixa.
- aberto a receber/pagar.
- vencidos.
- proximos 7/15/30 dias.
- saldo projetado 30/60/90 dias.
- pendencias de conciliacao.

Relatorios:

- fluxo realizado - implementado.
- fluxo projetado - pendente.
- DRE Gerencial - pendente.
- contas a receber com aging - parcial via status atrasado.
- contas a pagar com aging - parcial via status atrasado.
- orcado versus realizado - implementado.
- categorias e centros de custo - parcial.
- extrato por conta - parcial via fluxo realizado e filtros.
- conciliacao bancaria - implementado como relatorio de extrato bancario.
- contatos - implementado.

Implementado nesta leva:

- `src/lib/reports.ts` refeito com nomes corrigidos;
- relatorio `cashMovements`;
- relatorio `financialTitles`;
- relatorio `bankTransactions`;
- relatorio `transfers`;
- relatorio `budgetVariance`;
- exportacao CSV protege contra formula injection simples;
- `ReportExplorer` passa a mostrar os relatorios novos;
- pagina `/relatorios` atualizada com exportacoes rapidas novas;
- orcamento passa a comparar contra `CashMovement` e exclui transferencias do realizado;
- `npm.cmd run build`: passou.

Validacao:

- tela e export devem bater centavo a centavo.
- transferencias fora do resultado consolidado.
- titulos cancelados e baixas estornadas fora dos totais.

## Fase 7 - Orcamento

Objetivo: substituir metas comerciais por orcamento financeiro.

Implementar:

- orcamento mensal por categoria.
- centro de custo opcional.
- projeto/tag opcional somente se a estrutura existir.
- realizado, comprometido, saldo disponivel e desvio.

Compatibilidade:

- `Goal` vira legado e nao aparece no menu financeiro padrao.

## Fase 8 - Seguranca, papeis e admin SaaS

Implementar:

- hash moderno de senha com biblioteca confiavel.
- expiracao/revogacao de sessao.
- rate limit de login.
- roles: OWNER, ADMIN, FINANCE, VIEWER, ACCOUNTANT.
- permissoes por acao.
- superadmin fora do contexto normal do tenant.
- logs com before/after controlado e mascara.

Validacao:

- VIEWER nao faz mutacao.
- export respeita permissao.
- admin de um tenant nao acessa dados de outro.

## Fase 9 - PostgreSQL em producao

Objetivo: preparar SaaS comercial.

Ordem recomendada:

1. manter SQLite enquanto o novo modelo financeiro estabiliza localmente.
2. criar schema Prisma compativel com PostgreSQL.
3. criar ambiente de ensaio PostgreSQL.
4. migrar copia do SQLite.
5. validar contagens e totais.
6. testar restore.
7. planejar janela de corte na VPS.

Rollback:

- manter snapshot SQLite original.
- manter container antigo parado, sem apagar volume.
- se validacao falhar, voltar proxy para versao antiga.

## Backup antes de migrations

Local:

```powershell
Copy-Item .\prisma\dev.db ".\backup-dev-$(Get-Date -Format yyyy-MM-dd-HHmm).db"
```

VPS, exemplo seguro:

```bash
mkdir -p /opt/backups/merli360
docker cp merli360_app:/app/data/dev.db /opt/backups/merli360/dev-$(date +%F-%H%M).db
sha256sum /opt/backups/merli360/dev-*.db | tail -n 5
```

Restauracao VPS, somente com app parado:

```bash
docker compose --env-file .env.production -p novo_saas stop merli360_app
docker cp /opt/backups/merli360/NOME_DO_BACKUP.db merli360_app:/app/data/dev.db
docker compose --env-file .env.production -p novo_saas start merli360_app
docker logs --tail=80 merli360_app
```

## Criterios de conclusao por fase

Cada fase so deve fechar quando:

- build passa.
- lint/testes disponiveis passam ou falha fica documentada.
- migrations aplicadas ficam listadas.
- linha de base antes/depois nao diverge sem explicacao.
- dashboard fecha com relatorios.
- tenant isolation foi testado no fluxo alterado.
- rollback esta documentado.

## Proxima fatia recomendada

Implementar Fase 1 com baixo risco:

1. criar feature flags por tenant/produto.
2. ocultar CRM, Oferta 360, Metas e Ads do menu financeiro padrao.
3. renomear Clientes para Contatos na UI, mantendo tabela `Client`.
4. criar paginas placeholder funcionais para Contas financeiras, Conciliacao, Orcamento e Configuracoes, marcadas como "em preparacao" somente se ainda nao salvarem dados.
5. atualizar README com login, Docker real, backup e aviso de seed destrutivo.

Essa fatia nao altera dinheiro nem schema, entao e reversivel e adequada como primeiro passo apos a auditoria.

