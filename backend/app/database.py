from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

_is_sqlite = "sqlite" in settings.DATABASE_URL

if _is_sqlite:
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=settings.DEBUG,
    )
else:
    # PostgreSQL — use connection pool suitable for cloud
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,       # detect stale connections
        pool_size=5,
        max_overflow=10,
        pool_recycle=300,         # recycle every 5 min
        connect_args={
            "connect_timeout": 10,   # 10s per attempt, avoids infinite hang
        },
        echo=settings.DEBUG,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    """Add missing columns to existing tables (safe to run on every startup)."""
    if _is_sqlite:
        _run_migrations_sqlite()
    else:
        _run_migrations_pg()


def _run_migrations_pg():
    """PostgreSQL migrations — ALTER TABLE ADD COLUMN IF NOT EXISTS."""
    migrations = [
        # clients — new columns
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_fee FLOAT DEFAULT 0",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50)",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_obligations JSON",
        # clients — convert client_type from enum to varchar if still enum
        # (safe to run; no-op if already varchar)
        """DO $$ BEGIN
             IF EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_name='clients' AND column_name='client_type'
               AND data_type='USER-DEFINED'
             ) THEN
               ALTER TABLE clients ALTER COLUMN client_type TYPE VARCHAR(50);
             END IF;
           END $$""",
        # invoices — new columns
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'accounting'",
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_monthly_fee BOOLEAN DEFAULT FALSE",
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_month INTEGER",
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_year INTEGER",
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_label VARCHAR(50)",
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS included_obligations JSON",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(_text(sql))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                import logging
                logging.getLogger(__name__).warning(f"Migration skipped: {exc}")


def _run_migrations_sqlite():
    """SQLite migrations — ALTER TABLE ADD COLUMN (no IF NOT EXISTS support)."""
    import logging
    log = logging.getLogger(__name__)
    migrations = [
        ("clients", "monthly_fee", "REAL DEFAULT 0"),
        ("clients", "vat_number", "TEXT"),
        ("clients", "tax_obligations", "TEXT"),
        ("invoices", "service_type", "TEXT DEFAULT 'accounting'"),
        ("invoices", "is_monthly_fee", "INTEGER DEFAULT 0"),
        ("invoices", "period_month", "INTEGER"),
        ("invoices", "period_year", "INTEGER"),
        ("invoices", "period_label", "TEXT"),
        ("invoices", "included_obligations", "TEXT"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in migrations:
            try:
                conn.execute(_text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                conn.rollback()  # column already exists


def _text(sql):
    from sqlalchemy import text
    return text(sql)
