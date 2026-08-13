# Regras de negocio

## Gestao da Grafica

- Toda oportunidade aberta deve possuir proximo passo ou data de retorno.
- Todo orcamento deve possuir cliente, responsavel, validade e pelo menos um item.
- Desconto acima do limite do tenant exige aprovacao.
- Preco abaixo da margem minima exige aprovacao.
- Orcamento aprovado gera pedido e ordem de producao sem redigitacao.
- Orcamento aprovado gera entrega pendente e recebimento financeiro vinculado.
- Pedido preserva snapshot comercial e de custo do orcamento aprovado.
- Alteracoes posteriores em produto, material ou processo nao alteram pedidos antigos.
- Produtos, materiais, processos e parametros sao sempre isolados por tenant.
- Material com custo maior que zero entra como `VALIDATED`; material sem custo entra como `PENDING_VALIDATION`.
- Toda alteracao de custo de material cria novo historico de custo.
- Processo com custo maior que zero entra como `VALIDATED`; processo sem custo entra como `PENDING_VALIDATION`.
- Percentuais operacionais, como perda prevista, devem ficar entre 0 e 100.
- Recebimento parcial deve manter valor pendente e status corretos.
- Entrega concluida deve abrir pos-venda automaticamente.
- Registros transacionais devem ser cancelados com motivo, nao apagados.
- Mudancas criticas registram auditoria.
- Todas as consultas e gravacoes usam o `tenantId` do usuario autenticado.
- Acesso ao modulo nao basta para executar acoes criticas; catalogo, configuracoes, aprovacao, producao, recebimento e pos-venda validam permissao operacional no backend.
- Ordem de producao so pode ser liberada com checklist completo.
- Etapas de producao registram evento com usuario, status, tempo e observacao quando informados.
- Consumo de material deve ter descricao e quantidade positiva.
- Retrabalho deve registrar motivo, impacto e acao corretiva.
- Arquivos da grafica devem validar MIME, extensao, tamanho, tenant e registro vinculado antes de gravar.
- Downloads de arquivos usam rota autenticada e filtrada por tenant.
