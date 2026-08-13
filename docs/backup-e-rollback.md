# Backup e rollback

## Backup PostgreSQL

```bash
mkdir -p /opt/backups/merli360
docker exec merli360_postgres pg_dump -U merli360 merli360 > /opt/backups/merli360/merli360-$(date +%F-%H%M).sql
```

## Rollback de codigo

1. Identificar ultimo commit saudavel.
2. Restaurar branch/commit no Git.
3. Permitir deploy automatico ou executar deploy somente do `merli360_app`.
4. Verificar logs e login.

## Rollback de banco

Restauracao de banco em producao e acao critica e exige confirmacao explicita.
