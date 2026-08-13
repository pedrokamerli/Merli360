# Diagnostico inicial - Gestao da Grafica

Atualizado em: 13/08/2026

## Estado do Merli360

- Aplicacao Next.js 15 com App Router, TypeScript, Tailwind e Prisma.
- Desenvolvimento local usa `prisma/schema.prisma` com SQLite.
- Producao usa Docker e gera `prisma/schema.postgres.prisma` a partir do schema principal, trocando o provider para PostgreSQL.
- O deploy atual preserva `.env.production` e recria somente `merli360_app`.
- A VPS usa `/opt/novo-saas`, `merli360_app`, `merli360_postgres` e proxy compartilhado `evolync_nginx`.

## Autenticacao, tenant e permissoes

- Autenticacao propria por cookie `merli360_session`.
- `User` pertence a `Tenant`.
- APIs protegidas usam `requireApiUser`, `requireApiModule` ou `requireApiSuperAdmin`.
- Acesso por modulo usa `moduleAccess`, armazenado como `all`, JSON array ou lista separada por virgula.
- Super admin acessa todos os modulos.
- Toda nova consulta do modulo da grafica deve filtrar por `tenantId`.

## Entidades reutilizaveis

- `Tenant`: isolamento e marca do cliente.
- `User`: responsavel, auditoria e permissoes.
- `Client`: cliente final da grafica, sem duplicar cadastro.
- `Lead`: entrada comercial atual do CRM.
- `Attachment`: upload seguro ja existente com tenant e controle de download.
- `AuditLog`: auditoria central.
- `FinancialTitle`: contas a receber/pagar novas do financeiro evoluido.

## Lacunas antes do modulo

- Nao havia tabelas especificas para produtos graficos, materiais, processos, orcamentos versionados, pedidos e producao.
- Havia uma tela `/grafica` integrada ao CRM como primeira entrega, mas ela nao cobria o fluxo completo solicitado.
- O README esta parcialmente desatualizado: cita uma versao sem login, enquanto o sistema atual possui autenticacao, tenants e PostgreSQL em producao.
- Nao existem scripts `typecheck` e `test` no `package.json`; os comandos obrigatorios do documento ainda precisam ser formalizados.

## Decisao tecnica deste ciclo

- Criar o modulo nativo em `/gestao-grafica`.
- Reutilizar `Client`, `Lead`, `Attachment`, `AuditLog` e `FinancialTitle`.
- Criar tabelas proprias para o fluxo que precisa congelar historico: oportunidade grafica, produto, material, processo, orcamento, item, pedido, producao, entrega, pos-venda, recebimento, pagamento, tarefas, eventos e configuracoes.
- Manter `/grafica` como compatibilidade, redirecionando para `/gestao-grafica`.
- Usar `gestao-grafica` como chave de permissao do modulo.

## Riscos e cuidados

- Toda alteracao estrutural de banco em producao exige backup antes do deploy.
- O comando de deploy deve afetar somente `merli360_app`; o banco `merli360_postgres` deve receber apenas `prisma db push` executado pelo entrypoint.
- Nao alterar `evolync_nginx` salvo necessidade comprovada.
- Nao versionar arquivos de cliente, `.env`, dumps SQL ou credenciais.
