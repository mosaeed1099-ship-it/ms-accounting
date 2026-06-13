"""
Backup Records — metadata for every backup operation.
Actual backup data is emailed to admin or downloaded on-demand
(Railway filesystem is ephemeral — don't rely on local storage).
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean
from datetime import datetime
from app.database import Base


class BackupRecord(Base):
    __tablename__ = "backup_records"

    id             = Column(Integer, primary_key=True, index=True)

    # daily | weekly | monthly | manual | pre-deploy
    backup_type    = Column(String(20), nullable=False, index=True)

    # Descriptive label shown in UI
    label          = Column(String(200))

    # What was backed up
    includes_db      = Column(Boolean, default=True)
    includes_uploads = Column(Boolean, default=False)
    db_size_kb       = Column(Float, default=0)
    uploads_size_kb  = Column(Float, default=0)
    total_size_kb    = Column(Float, default=0)

    # Table/record counts at backup time (JSON string)
    db_stats         = Column(Text)   # e.g. '{"clients":88,"tasks":312,...}'

    # completed | failed | pending
    status         = Column(String(20), default="pending", index=True)
    error_message  = Column(Text)

    # Delivery — email sent / available for download
    emailed_to     = Column(String(200))
    emailed_at     = Column(DateTime)

    # Who triggered it (null = automatic scheduler)
    triggered_by   = Column(Integer)   # user id
    notes          = Column(Text)

    created_at     = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at   = Column(DateTime)
