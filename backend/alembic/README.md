# Database Migrations — Alembic

## Setup
Alembic is configured to read DATABASE_URL from environment.

## Common Commands

```bash
# Generate a new migration (auto-detect model changes)
alembic revision --autogenerate -m "describe change here"

# Apply all pending migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# Rollback to a specific revision
alembic downgrade <revision_id>

# Show current migration status
alembic current

# Show migration history
alembic history --verbose
```

## Railway Deployment
Migrations run automatically on deploy via Procfile/startup.
The app uses `create_all()` as fallback for new tables.
For schema changes (add column, rename, drop): always use Alembic.

## Rollback Strategy
1. `alembic downgrade -1` → undoes last migration
2. `git revert <commit>` → reverts code change
3. `git push origin main` → redeploys
