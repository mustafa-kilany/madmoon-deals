# Backups (BACKEND_PLAN B12.3, SECURITY_PLAN S7.7)

**Two layers.** The managed database's own daily backups (turn them on, keep 30 days) protect against a broken server; an encrypted copy elsewhere protects against losing the account or the host.

| Command | What it does |
|---|---|
| `npm run db:backup -- [file]` | An encrypted copy of `DATABASE_URL`. Needs `BACKUP_KEY` (`npm run secret`); keep a copy of the key **away from the backups**. |
| `npm run db:restore -- <file> <url>` | A backup into an **empty** database. It refuses one with tables. |
| `npm run db:restore-test` | The drill: backs up, restores into a throwaway database, compares every table, checks a wrong key is refused, runs the money check, drops the copy. It only reads the real database. |

Needs PostgreSQL's tools (`pg_dump`, `pg_restore`, `psql`) on the PATH or `PG_BIN`, of the same version as the server.

**Schedule:** the drill every 3 months and after any big change (SECURITY_PLAN S11). Photos and certificates live in the buckets (`docs/STORAGE.md`): turn on versioning or a copy there too. A database restored without them still works, with missing pictures.

**After restoring for real:** set `DATABASE_URL`, run `npx prisma migrate deploy` and `npm run money:check`, then compare the latest orders with the payment provider's report: anything after the backup's time needs a person.
