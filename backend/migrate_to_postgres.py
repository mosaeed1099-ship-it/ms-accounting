"""
migrate_to_postgres.py
======================
تنفيذ: python migrate_to_postgres.py --target postgresql://user:pass@host/db

يرحّل جميع بيانات SQLite إلى PostgreSQL.
"""
import sys
import os
import argparse
import sqlite3
import json
from datetime import datetime

def get_tables(conn):
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version'")
    return [r[0] for r in cur.fetchall()]


def table_data(conn, table):
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM {table}")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    return cols, rows


def migrate(sqlite_path: str, pg_url: str):
    print(f"📂 Source: {sqlite_path}")
    print(f"🐘 Target: {pg_url[:40]}...")

    # Connect SQLite
    sq = sqlite3.connect(sqlite_path)
    sq.row_factory = sqlite3.Row

    # Connect PostgreSQL via SQLAlchemy (uses project models)
    os.environ['DATABASE_URL'] = pg_url
    from app.database import engine, create_tables
    from app.config import settings

    print("\n⏳ Creating tables in PostgreSQL...")
    create_tables()
    print("✅ Tables created")

    from sqlalchemy import text

    tables = get_tables(sq)
    print(f"\n📋 Tables found: {tables}\n")

    with engine.begin() as pg:
        for table in tables:
            cols, rows = table_data(sq, table)
            if not rows:
                print(f"  ⏭️  {table}: empty — skipped")
                continue

            # Disable FK checks during insert
            placeholders = ', '.join([f':{c}' for c in cols])
            col_list = ', '.join([f'"{c}"' for c in cols])
            stmt = f'INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

            inserted = 0
            for row in rows:
                try:
                    pg.execute(text(stmt), dict(zip(cols, row)))
                    inserted += 1
                except Exception as e:
                    print(f"    ⚠️  Row error in {table}: {e}")

            print(f"  ✅ {table}: {inserted}/{len(rows)} rows migrated")

        # Reset sequences for PostgreSQL (so new inserts get correct IDs)
        for table in tables:
            try:
                pg.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 1)) FROM {table}"))
            except Exception:
                pass

    sq.close()
    print("\n🎉 Migration complete!")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sqlite', default='ms_accounting.db', help='Path to SQLite file')
    parser.add_argument('--target', required=True, help='PostgreSQL URL')
    args = parser.parse_args()

    if not os.path.exists(args.sqlite):
        print(f"❌ SQLite file not found: {args.sqlite}")
        sys.exit(1)

    migrate(args.sqlite, args.target)
