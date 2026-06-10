from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "MS Accounting"
    APP_VERSION: str = "2.2.4-vat-dict"
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite:///./ms_accounting.db"

    SECRET_KEY: str = "ms-accounting-secret-key-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB

    ANTHROPIC_API_KEY: Optional[str] = None

    # Google Drive Integration
    GOOGLE_DRIVE_API_KEY: Optional[str] = None

    # Email / SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    EMAIL_FROM_NAME: str = "MS Accounting"
    EMAIL_FROM: str = ""

    BACKUP_DIR: str = "backups"
    BACKUP_INTERVAL_HOURS: int = 24

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def fix_postgres_url(cls, v: str) -> str:
        """Render/Railway return postgres:// — SQLAlchemy requires postgresql://"""
        if isinstance(v, str) and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
