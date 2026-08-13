# Modulo Gestao da Grafica

## Objetivo

O modulo Gestao da Grafica controla o fluxo de contato, cliente, oportunidade, orcamento, aprovacao, pedido, producao, entrega, recebimento e pos-venda para grafica, serigrafia e comunicacao visual.

## Rotas

- `/gestao-grafica`: painel operacional do modulo.
- `/grafica`: rota de compatibilidade que redireciona para `/gestao-grafica`.

## Permissao

A chave do modulo e `gestao-grafica`. O super admin tambem tem acesso. Usuarios com `moduleAccess=["crm"]` continuam vendo o CRM comercial, mas precisam de `gestao-grafica` ou `all` para operar o modulo completo.

## Fluxo funcional deste ciclo

1. Cadastro rapido de oportunidade grafica.
2. Criacao/reutilizacao de cliente.
3. Criacao de orcamento com item, medidas, quantidade, material, processo, perdas, frete, instalacao, impostos, taxas, comissao e desconto.
4. Calculo de custo total, preco sugerido, preco minimo, margem, markup, lucro e necessidade de aprovacao.
5. Aprovacao do orcamento com transacao Prisma.
6. Geracao automatica de pedido e ordem de producao.
7. Separacao entre valor vendido, faturado e recebido.

## Dados insuficientes

Indicadores financeiros, margem e custos exibem aviso quando a base nao possui dados suficientes ou quando custos foram importados/preenchidos como `PENDING_VALIDATION`.
