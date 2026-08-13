# Diagnostico e Roadmap da IA 360

Data: 2026-07-20

## Stack atual

- Next.js 15 com App Router.
- TypeScript.
- Prisma ORM.
- Banco configurado por `DATABASE_URL` no Prisma.
- Tailwind CSS.
- Rotas API internas em `src/app/api`.
- Sessao propria por cookie assinado em `src/lib/auth.ts`.
- Multi-tenant por `tenantId`.

## Base de dados mapeada

Entidades principais ja existentes:

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
- `Buyer`
- `Product`
- `Planting`
- `Harvest`
- `StockMovement`
- `Sale`
- `AgendaEvent`
- `FinancialAccount`
- `CostCenter`
- `Budget`
- `BudgetLine`
- `FinancialTitle`
- `Settlement`
- `CashMovement`
- `Transfer`
- `BankImportBatch`
- `BankTransaction`
- `ReconciliationGroup`
- `ReconciliationAllocation`
- `Attachment`
- `WebPushSubscription`
- `NotificationRule`
- `AiLearningRule`
- `AiConfiguration`
- `AssistantProfile`
- `AssistantMessage`

## O que ja esta funcional

- Login por usuario e tenant.
- Isolamento basico por `tenantId` nas principais APIs.
- Super admin.
- Configuracao global de IA com provedores/modelos.
- IA com chat, anexos, memoria, comandos de reset e execucao de algumas acoes reais.
- Criacao de movimentacoes pela IA.
- Criacao de contas a pagar e receber pela IA.
- Sincronizacao de contas pagas/recebidas para `Settlement` e `CashMovement`.
- Importacao de CSV, XLSX, OFX e PDF com parsers especificos e fallback.
- Conciliacao bancaria gerando `Transaction` e `CashMovement`.
- Carteiras/contas financeiras com saldo calculado por fluxo.
- Dashboard com saldos, entradas, saidas, contas abertas e dados por tenant.
- Relatorios com preview, filtros e exportacao CSV.
- Relatorio por categoria usando dados reais.
- PWA e notificacoes push.
- Modulo agro basico com produtos, plantios, colheitas, estoque, vendas, compradores e agenda.

## O que esta parcialmente implementado

- IA operacional: ja executa algumas acoes, mas ainda nao possui um orquestrador formal separado em classes/servicos.
- Auditoria: existe `AuditLog`, mas nem toda acao da IA registra plano, estado anterior e estado posterior.
- Memoria: existe perfil e regras aprendidas, mas ainda falta uma tela completa para revisar, editar e aprovar memorias.
- Relatorios: ja usam dados reais e categorias, mas ainda falta construtor salvo, comparacao entre periodos, PDF e agendamento.
- Agro: existe fluxo rural basico, mas ainda faltam propriedades, talhoes, operacoes agricolas, insumos, lotes e custo por hectare.
- Qualidade de dados: comecou no snapshot semantico, mas ainda precisa aparecer melhor na interface.
- Projecoes: dashboard calcula 30/60/90 dias de forma simples, mas ainda nao tem cenarios conservador/provavel/otimista.
- Eventos internos: hoje as atualizacoes acontecem de forma direta em services/rotas, ainda sem barramento de eventos formal.

## O que esta ausente ou precisa evoluir

- `AIOrchestrator` formal com plano, politica, ferramentas e confirmacoes como objetos persistentes.
- Registro formal de ferramentas da IA com schema, risco, permissao, idempotencia e auditoria.
- Central de pendencias inteligente.
- Desfazer por compensacao para todas as acoes reversiveis.
- Auditoria completa de acoes da IA.
- Filas assicronas para OCR/importacoes longas.
- Observabilidade de custo, tokens, tempo, falhas e sucesso por ferramenta.
- Relatorios salvos/favoritos/agendados.
- PDF nativo de relatorios.
- Projecoes e simulacoes avancadas.
- Metas com ritmo necessario, probabilidade e fatores.
- Agro completo com talhoes, propriedades, insumos, lotes, operacoes e rentabilidade por safra.

## Problemas e riscos encontrados

- Existem modelos financeiros legados (`Transaction`, `AccountPayable`, `AccountReceivable`) convivendo com a base nova (`FinancialTitle`, `Settlement`, `CashMovement`). Isso exige cuidado para nao duplicar valores.
- Algumas telas ainda podem consultar modelos legados diretamente.
- A IA ja executa acoes, mas o fluxo ainda mistura interpretacao, execucao e resposta em arquivos grandes.
- Alguns textos antigos possuem sinais de encoding quebrado em labels/mensagens.
- Acoes sensiveis precisam de confirmacao e auditoria mais forte.
- Mudancas estruturais no schema precisam de backup/migracao cuidadosa por causa da VPS em producao.

## Camada semantica criada

Foi criada a camada inicial em:

- `src/lib/semantic-finance.ts`

Ela define oficialmente e calcula:

- Receita realizada.
- Receita prevista.
- Despesa realizada.
- Despesa prevista.
- Resultado.
- Saldo consolidado.
- Saldo projetado.
- Valores vencidos.
- Agrupamento por categoria.
- Agrupamento por conta.
- Agrupamento por centro de custo.
- Qualidade basica dos dados.
- Alertas financeiros principais.

Objetivo: dashboard, relatorios e IA devem usar essa camada para evitar formulas duplicadas.

## Arquitetura operacional da IA iniciada

Foram criados componentes base da IA operacional:

- `src/lib/ai-tool-registry.ts`
- `src/lib/ai-policy.ts`
- `src/lib/ai-plan.ts`
- `src/lib/ai-audit-service.ts`

O que ja ficou funcional:

- Registro central de ferramentas da IA com risco, permissao, confirmacao, entidade e campos obrigatorios.
- Politica de execucao no backend antes de alterar dados.
- Acoes sensiveis bloqueadas sem confirmacao explicita.
- Comandos destrutivos protegidos por permissao e comando exato.
- Plano estruturado gerado para a acao interpretada pela IA.
- Auditoria de inicio de execucao e bloqueios por politica.
- Rotas de chat, anexo e confirmacao passam contexto para auditoria/politica.

Essa etapa ainda nao transforma toda a IA em um orquestrador separado, mas cria a base segura para isso.

## Ordem recomendada das fases

1. Consolidar a camada semantica no dashboard, relatorios e IA.
2. Separar a IA em orquestrador, contexto, politicas, ferramentas e executor.
3. Expandir o registro formal de ferramentas da IA para todas as consultas e modulos.
4. Persistir planos/confirmacoes em tabela propria para retomar a conversa sem repetir pedido.
5. Expandir auditoria da IA com estado anterior/posterior.
6. Melhorar central de pendencias e qualidade dos dados.
7. Evoluir anexos/importacoes com estados e pre-visualizacao melhor.
8. Melhorar memoria estruturada por usuario.
9. Evoluir relatorios com comparacao, PDF, agendamento e registros de origem.
10. Evoluir Agro para propriedades, talhoes, insumos, lotes e rentabilidade.
11. Adicionar proatividade, cenarios e notificacoes inteligentes.
12. Criar testes unitarios e de integracao para as regras financeiras e IA.

## Criterios de validacao por fase

- Build de producao passa.
- Dashboard, relatorios e IA mostram valores consistentes para o mesmo mes.
- Toda consulta respeita `tenantId`.
- Toda acao financeira cria registro real no banco.
- Baixa de titulo gera `Settlement` e `CashMovement`.
- Importacao/conciliacao nao duplica lancamento.
- IA nao afirma execucao sem retorno real do backend.
- Acoes sensiveis exigem confirmacao.
- Auditoria registra sucesso e erro.
