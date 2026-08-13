from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
db_path = root / "prisma" / "dev.db"
sql_path = root / "prisma" / "migrations" / "20260702150500_init" / "migration.sql"

db_path.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(db_path) as conn:
    conn.executescript(sql_path.read_text(encoding="utf-8"))
    conn.execute(
        'CREATE TABLE IF NOT EXISTS "_prisma_migrations" ('
        '"id" TEXT NOT NULL PRIMARY KEY,'
        '"checksum" TEXT NOT NULL,'
        '"finished_at" DATETIME,'
        '"migration_name" TEXT NOT NULL,'
        '"logs" TEXT,'
        '"rolled_back_at" DATETIME,'
        '"started_at" DATETIME NOT NULL DEFAULT current_timestamp,'
        '"applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0)'
    )
    conn.execute(
        'INSERT OR IGNORE INTO "_prisma_migrations" '
        '("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count") '
        "VALUES ('20260702150500_init','manual','2026-07-02 00:00:00','20260702150500_init',NULL,NULL,current_timestamp,1)"
    )

print(f"SQLite inicializado em {db_path}")
