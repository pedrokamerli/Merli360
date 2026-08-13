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
12. Recebimento parcial atualiza valor recebido, pendente e status sem alterar o valor vendido.
13. Cadastro nativo de produtos graficos, materiais, processos e parametros comerciais por tenant.
14. Historico de custo de material criado ao cadastrar ou alterar custo manualmente.
15. Produto cadastrado pode ser vinculado ao item do orcamento, preservando o snapshot comercial no pedido aprovado.
16. Acoes criticas protegidas no backend por perfil operacional da grafica.

## Dados insuficientes

Indicadores financeiros, margem e custos exibem aviso quando a base nao possui dados suficientes ou quando custos foram importados/preenchidos como `PENDING_VALIDATION`.

Custos zerados ou ainda nao conferidos entram como `PENDING_VALIDATION`. A validacao real dos valores deve ser feita pelo responsavel operacional antes de usar esses dados como base final de preco.
