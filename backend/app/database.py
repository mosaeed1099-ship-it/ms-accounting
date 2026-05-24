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
