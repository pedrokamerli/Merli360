# Permissoes

## Chaves de modulo

- `all`: acesso completo.
- `financeiro`: modulo financeiro.
- `crm`: CRM comercial.
- `gestao-grafica`: Gestao da Grafica.

## Papeis operacionais da grafica

Os papeis detalhados do modulo sao armazenados em `GraphicSetting` por tenant. Neste ciclo, a autorizacao de backend usa a chave `gestao-grafica`, aceita `crm` como compatibilidade para usuarios ja integrados e considera o papel global do usuario.

- OWNER_ADMIN: acesso total, custos, margens, configuracoes, descontos e auditoria.
- SALES_MANAGER: clientes, oportunidades, orcamentos, retornos, conversao e indicadores comerciais.
- SALES: clientes, oportunidades, orcamentos e interacoes proprias, sem custos internos detalhados por padrao.
- PRODUCTION: ordens liberadas, etapas, consumo, perdas, retrabalho e impedimentos.
- FINANCE: recebimentos, parcelas, atrasos e indicadores financeiros autorizados.
- ADVISOR: leitura, relatorios autorizados e observacoes estrategicas.
