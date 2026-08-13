# Permissoes

## Chaves de modulo

- `all`: acesso completo.
- `financeiro`: modulo financeiro.
- `crm`: CRM comercial.
- `gestao-grafica`: Gestao da Grafica.

## Papeis operacionais da grafica

Os papeis detalhados do modulo sao armazenados em `GraphicSetting` por tenant na chave `userRole:<userId>`. Quando nao houver papel configurado, `superadmin` e `admin` entram como `OWNER_ADMIN`; demais usuarios entram como `SALES`.

Usuarios com `settings:manage` podem ajustar esses papeis na propria tela da Gestao da Grafica. A listagem de usuarios e filtrada pelo tenant autenticado e nao expõe dados sensiveis.

Neste ciclo, a autorizacao de acesso ao modulo ainda aceita `crm` como compatibilidade para usuarios ja integrados, mas as acoes criticas abaixo ja possuem validacao de backend por perfil operacional.

- OWNER_ADMIN: acesso total, custos, margens, configuracoes, descontos e auditoria.
- SALES_MANAGER: clientes, oportunidades, orcamentos, retornos, conversao e indicadores comerciais.
- SALES: clientes, oportunidades, orcamentos e interacoes proprias, sem custos internos detalhados por padrao.
- PRODUCTION: ordens liberadas, etapas, consumo, perdas, retrabalho e impedimentos.
- FINANCE: recebimentos, parcelas, atrasos e indicadores financeiros autorizados.
- ADVISOR: leitura, relatorios autorizados e observacoes estrategicas.

## Acoes protegidas no backend

- `catalog:manage`: criar e editar produtos, materiais e processos.
- `settings:manage`: editar parametros comerciais da grafica.
- `opportunity:write`: criar oportunidades e clientes pelo fluxo grafico.
- `quote:create`: criar orcamentos.
- `quote:approve`: aprovar orcamentos e gerar pedido/producao/recebimento.
- `production:update`: atualizar producao e entregas.
- `receivable:update`: registrar recebimentos.
- `post-sale:update`: registrar pos-venda.
- `report:view`: consultar indicadores autorizados e exportar relatorios comerciais/operacionais.

## Exportacoes da grafica

- Oportunidades, orcamentos, pedidos e producao: `report:view`.
- Recebimentos: `receivable:update`.
- Auditoria: perfil com `cost:view`, atualmente `OWNER_ADMIN`.
