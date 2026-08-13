# Deploy VPS

## Fluxo

1. Desenvolver localmente.
2. Verificar `git status`.
3. Rodar validacoes locais.
4. Revisar diff.
5. Commit e push.
6. Fazer backup do banco na VPS.
7. Deixar o mecanismo Git atualizar `/opt/novo-saas`.
8. Recriar somente `merli360_app`.
9. Verificar logs e `/login`.

## Cuidados

- Nao recriar `evolync_nginx`.
- Nao alterar `evolync_postgres`.
- Nao versionar `.env.production`.
- Nao executar `docker compose down` geral.
- Usar o projeto Compose correto do Merli360.
