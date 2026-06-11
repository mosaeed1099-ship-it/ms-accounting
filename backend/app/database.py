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
        # documents — Google Drive fields
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS gdrive_file_id VARCHAR(100)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS gdrive_view_url VARCHAR(500)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS gdrive_thumb_url VARCHAR(500)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS gdrive_mime_type VARCHAR(100)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS gdrive_folder_path VARCHAR(500)",
        # documents — convert category enum to varchar (lowercase values)
        # Step 1: drop default constraint (required before type change)
        """DO $$ BEGIN
             IF EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_name='documents' AND column_name='category'
               AND data_type='USER-DEFINED'
             ) THEN
               ALTER TABLE documents ALTER COLUMN category DROP DEFAULT;
             END IF;
           END $$""",
        # Step 2: convert enum column to varchar
        """DO $$ BEGIN
             IF EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_name='documents' AND column_name='category'
               AND data_type='USER-DEFINED'
             ) THEN
               ALTER TABLE documents ALTER COLUMN category TYPE VARCHAR(50) USING lower(category::text);
             END IF;
           END $$""",
        # Step 3: re-add a varchar default
        """DO $$ BEGIN
             IF EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_name='documents' AND column_name='category'
               AND data_type IN ('character varying')
               AND column_default IS NULL
             ) THEN
               ALTER TABLE documents ALTER COLUMN category SET DEFAULT 'other';
             END IF;
           END $$""",
        # Step 4: normalize any uppercase varchar values to lowercase
        "UPDATE documents SET category = lower(category) WHERE category IS NOT NULL AND category != lower(category)",
        # Step 5: drop the old enum type if no longer referenced
        "DROP TYPE IF EXISTS documentcategory",
        # documents — allow null file_path for gdrive-only docs
        """DO $$ BEGIN
             IF EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_name='documents' AND column_name='file_path'
               AND is_nullable='NO'
             ) THEN
               ALTER TABLE documents ALTER COLUMN file_path DROP NOT NULL;
             END IF;
           END $$""",
        # quotations — new columns for Smart Quotation System
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quote_number VARCHAR(30)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_name VARCHAR(200)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_phone VARCHAR(30)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_email VARCHAR(150)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS legal_entity VARCHAR(100)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS activity VARCHAR(300)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS activity_location VARCHAR(100)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS capital FLOAT DEFAULT 0",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS deliverables JSON",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS requirements JSON",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS extra_services JSON",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS expenses_total FLOAT DEFAULT 0",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS government_fees FLOAT DEFAULT 0",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS office_fees FLOAT DEFAULT 0",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS greeting VARCHAR(100) DEFAULT 'مساء الخير'",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS advisor_name VARCHAR(100)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_notes TEXT",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS valid_until DATE",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS notes TEXT",
        # ── Accounting ERP Phase 1 ──────────────────────────────────────────
        # AccAccount new columns
        "ALTER TABLE acc_accounts ADD COLUMN IF NOT EXISTS name_en VARCHAR(200)",
        "ALTER TABLE acc_accounts ADD COLUMN IF NOT EXISTS account_subtype VARCHAR(40)",
        "ALTER TABLE acc_accounts ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1",
        "ALTER TABLE acc_accounts ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE",
        "ALTER TABLE acc_accounts ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP'",
        # AccJournalEntry new columns
        "ALTER TABLE acc_journal_entries ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100)",
        # AccJournalLine new columns
        "ALTER TABLE acc_journal_lines ADD COLUMN IF NOT EXISTS partner_name VARCHAR(200)",
        "ALTER TABLE acc_journal_lines ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100)",
        # AccTransaction new column
        "ALTER TABLE acc_transactions ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100)",
        # New tables created by SQLAlchemy create_all — just ensure FKs exist
        # acc_treasury_txs, acc_checks, acc_advances, eta_credentials, eta_documents are new tables
        # Safety: add any possibly-missing ETA columns
        "ALTER TABLE eta_credentials ADD COLUMN IF NOT EXISTS company_name_eta VARCHAR(300)",
        "ALTER TABLE eta_credentials ADD COLUMN IF NOT EXISTS last_sync_message TEXT",
        # ── Settlement / Appointments / Government Papers ────────────────────
        # These tables are created by create_all; safety columns below
        "ALTER TABLE employee_settlements ADD COLUMN IF NOT EXISTS reason TEXT",
        "ALTER TABLE employee_settlements ADD COLUMN IF NOT EXISTS expense_items TEXT DEFAULT '[]'",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE",
        "ALTER TABLE government_papers ADD COLUMN IF NOT EXISTS has_copy BOOLEAN DEFAULT FALSE",
        # ── Payroll / HR ──────────────────────────────────────────────────────
        "ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS insurance_share FLOAT DEFAULT 11",
        "ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS company_insurance FLOAT DEFAULT 18",
        "ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)",
        "ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50)",
        # ── Fixed Assets ─────────────────────────────────────────────────────
        "ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id)",
        "ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS depreciation_method VARCHAR(30) DEFAULT 'straight_line'",
        "ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS last_dep_date DATE",
        # ── البوسطة (Internal Mail) ───────────────────────────────────────────
        "ALTER TABLE internal_mails ADD COLUMN IF NOT EXISTS document_type VARCHAR(100)",
        "ALTER TABLE internal_mails ADD COLUMN IF NOT EXISTS from_person VARCHAR(200)",
        # ── الميزانيات (Financial Statements) ────────────────────────────────
        "ALTER TABLE financial_statements ADD COLUMN IF NOT EXISTS statement_type VARCHAR(50) DEFAULT 'balance'",
        "ALTER TABLE financial_statements ADD COLUMN IF NOT EXISTS period VARCHAR(50) DEFAULT 'annual'",
        # ── التايم شيت (Time Entries) ─────────────────────────────────────────
        "ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id)",
        # ── Client extended profile (Point 4) ────────────────────────────────
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS trade_name VARCHAR(200)",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS legal_entity VARCHAR(100)",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_status VARCHAR(30) DEFAULT 'active'",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS activity_start_date DATE",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS activity_end_date DATE",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_lang VARCHAR(5) DEFAULT 'ar'",
        # ── Collections — free-text client name ──────────────────────────────
        "ALTER TABLE collection_contracts ADD COLUMN IF NOT EXISTS client_name_free VARCHAR(200)",
        "ALTER TABLE collection_payments ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id)",
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
        ("documents", "gdrive_file_id", "TEXT"),
        ("documents", "gdrive_view_url", "TEXT"),
        ("documents", "gdrive_thumb_url", "TEXT"),
        ("documents", "gdrive_mime_type", "TEXT"),
        ("documents", "gdrive_folder_path", "TEXT"),
        # ── Client extended profile ───────────────────────────────────────────
        ("clients", "trade_name", "TEXT"),
        ("clients", "legal_entity", "TEXT"),
        ("clients", "company_status", "TEXT DEFAULT 'active'"),
        ("clients", "activity_start_date", "TEXT"),
        ("clients", "activity_end_date", "TEXT"),
        ("clients", "preferred_lang", "TEXT DEFAULT 'ar'"),
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
