import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# Make sure app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import ALL models so Alembic can autogenerate migrations
from app.database import Base
import app.models.user
import app.models.client
import app.models.invoice
import app.models.task
import app.models.tax
import app.models.activity
import app.models.audit_log
import app.models.permission
import app.models.backup
import app.models.lead
import app.models.quotation
import app.models.obligation
import app.models.establishment
import app.models.folder
import app.models.company_document
import app.models.client_portal
import app.models.office_service
import app.models.monthly_fees

target_metadata = Base.metadata


def get_url():
    """Read DATABASE_URL from environment (Railway sets this automatically)."""
    return os.environ.get("DATABASE_URL", config.get_main_option("sqlalchemy.url"))


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
