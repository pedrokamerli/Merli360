# Modulo Gestao da Grafica

## Objetivo

O modulo Gestao da Grafica controla o fluxo de contato, cliente, oportunidade, orcamento, aprovacao, pedido, producao, entrega, recebimento e pos-venda para grafica, serigrafia e comunicacao visual.

## Rotas

- `/gestao-grafica`: painel operacional do modulo.
- `/grafica`: rota de compatibilidade que redireciona para `/gestao-grafica`.

## Permissao

A chave do modulo e `gestao-grafica`. O super admin tambem tem acesso. Neste ciclo de transicao, usuarios com `moduleAccess=["crm"]` tambem acessam o modulo para preservar os acessos ja integrados.

## Fluxo funcional deste ciclo

1. Cadastro rapido de oportunidade grafica.
2. Criacao/reutilizacao de cliente.
3. Criacao de orcamento com item, medidas, quantidade, material, processo, perdas, frete, instalacao, impostos, taxas, comissao e desconto.
4. Calculo de custo total, preco sugerido, preco minimo, margem, markup, lucro e necessidade de aprovacao.
5. Aprovacao do orcamento com transacao Prisma.
6. Geracao automatica de pedido e ordem de producao.
7. Separacao entre valor vendido, faturado e recebido.
8. Link compartilhavel de orcamento por token.
9. PDF comercial simples do orcamento, sem expor custos internos.
10. Entrega pendente criada automaticamente ao aprovar orcamento.
11. Entrega concluida cria pos-venda aberto.
12. Recebimento parcial atualiza valor recebido, pendente, status e baixa financeira central sem alterar o valor vendido.
13. Cadastro nativo de produtos graficos, materiais, processos e parametros comerciais por tenant.
14. Historico de custo de material criado ao cadastrar ou alterar custo manualmente.
15. Produto cadastrado pode ser vinculado ao item do orcamento, preservando o snapshot comercial no pedido aprovado.
16. Acoes criticas protegidas no backend por perfil operacional da grafica.
17. Producao com checklist obrigatorio para liberacao, etapas atualizaveis, consumo de material e registro de retrabalho.
18. Importacao de planilha Excel com previa e confirmacao para parametros, materiais, processos e produtos.
19. Upload privado de arquivos da grafica vinculado a oportunidade, orcamento, pedido, producao, entrega ou pos-venda.
20. Orcamentos podem ser enviados, recusados, cancelados com motivo e duplicados com novo numero.
21. Indicadores do painel informam formula, periodo, fonte, criterio, limitacao e qualidade do dado.
22. Relatorios CSV exportam oportunidades, orcamentos, pedidos, producao, recebimentos e auditoria com permissao de backend.
23. Oportunidades registram contato, reagendamento de retorno, tarefa aberta e perda com motivo obrigatorio.
24. Excecoes de margem/desconto possuem aprovacao comercial antes da conversao em pedido.
25. Pos-venda pode gerar nova oportunidade e tarefa de retorno a partir de reclamacao, baixa satisfacao ou chance de recorrencia.
26. Dashboard exibe ticket medio aprovado, margem media estimada, descontos, aprovacoes abertas, producao atrasada/bloqueada e entregas no prazo.
27. Administradores do modulo podem configurar papeis operacionais da equipe por usuario do tenant.
28. Funil visual usa etapas configuraveis por tenant em `GraphicPipelineStage`, com validacao no backend ao mover oportunidades.
29. Dashboard comercial mostra clientes novos, recorrentes, inativos e rankings por origem, produto, responsavel e segmento.
30. Dashboard de producao mede horas previstas, horas realizadas, variacao, ciclo medio e tempo entre aprovacao e producao.

## Dados insuficientes

Indicadores financeiros, margem e custos exibem aviso quando a base nao possui dados suficientes ou quando custos foram importados/preenchidos como `PENDING_VALIDATION`.

Indicadores financeiros ficam ocultos para perfis sem autorizacao financeira/custo. Nesses casos, o painel mostra `Restrito` em vez de expor valor vendido, faturado, recebido ou pendente.

Ticket medio, margem media e descontos tambem respeitam permissao financeira/custo. Producoes sem prazo prometido e entregas sem data realizada nao entram nos indicadores de atraso ou pontualidade.

Rankings de resultado por cliente e produto ocultam valores para perfis sem permissao financeira/custo. Rankings comerciais sem valor financeiro exibem apenas contagem operacional.

Cada recebimento grafico vinculado a um titulo financeiro cria baixa idempotente no financeiro central, com movimento de caixa associado. Pagamentos acima do saldo aberto aplicam somente o valor pendente.

Custos zerados ou ainda nao conferidos entram como `PENDING_VALIDATION`. A validacao real dos valores deve ser feita pelo responsavel operacional antes de usar esses dados como base final de preco.

Na producao, a liberacao exige checklist completo de arte, medidas, material, prazo e arquivos. Retrabalho exige motivo, impacto e acao corretiva.

Indicadores de tempo de producao usam `GraphicProductionStep` e `GraphicProductionOrder`. Ordens ou etapas sem tempo preenchido nao entram como base suficiente para o indicador completo.

Orcamentos aprovados nao podem voltar de status. Recusa e cancelamento exigem motivo e geram versao historica.

Quando um orcamento exige aprovacao por desconto ou margem, primeiro deve haver aprovacao comercial da excecao. Somente depois o botao `Gerar pedido` converte o orcamento em pedido, producao, entrega e recebimento.

Oportunidades abertas devem manter proximo passo ou data de retorno. Quando houver proximo passo com data, o sistema cria tarefa operacional vinculada. Oportunidade perdida exige motivo e nao reabre no mesmo registro; para retomar, crie nova oportunidade preservando o historico.

Pos-venda com satisfacao baixa, reclamacao ou decisao explicita cria oportunidade vinculada ao cliente do pedido. Quando o usuario informa proximo passo e data, uma tarefa de retorno tambem e criada.

## Relatorios e exportacao

Os atalhos do painel usam `/api/gestao-grafica/reports/:model`.

- `opportunities`, `quotes`, `orders` e `production`: exigem `report:view`.
- `receivables`: exige permissao financeira de recebimento.
- `audit`: exige perfil com visao de custo/auditoria.

Todo CSV e filtrado por tenant, usa dados persistidos e protege celulas iniciadas por `=`, `+`, `-` ou `@` para reduzir risco de formula injection em planilhas.
