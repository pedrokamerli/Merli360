# Regras de negocio

## Gestao da Grafica

- Toda oportunidade aberta deve possuir proximo passo ou data de retorno.
- Todo orcamento deve possuir cliente, responsavel, validade e pelo menos um item.
- Desconto acima do limite do tenant exige aprovacao.
- Preco abaixo da margem minima exige aprovacao.
- Orcamento aprovado gera pedido e ordem de producao sem redigitacao.
- Pedido preserva snapshot comercial e de custo do orcamento aprovado.
- Alteracoes posteriores em produto, material ou processo nao alteram pedidos antigos.
- Registros transacionais devem ser cancelados com motivo, nao apagados.
- Mudancas criticas registram auditoria.
- Todas as consultas e gravacoes usam o `tenantId` do usuario autenticado.
