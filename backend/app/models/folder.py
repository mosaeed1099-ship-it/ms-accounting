from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Folder(Base):
    __tablename__ = "folders"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(200), nullable=False)
    client_id  = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=True)
    parent_id  = Column(Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True)
    path       = Column(String(1000))
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    client   = relationship("Client")
    creator  = relationship("User")
    children = relationship("Folder", back_populates="parent", cascade="all, delete-orphan")
    parent   = relationship("Folder", back_populates="children", remote_side=[id])
    files    = relationship("FileItem", back_populates="folder", cascade="all, delete-orphan")


class FileItem(Base):
    __tablename__ = "file_items"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(300), nullable=False)
    original_name= Column(String(300))
    file_path    = Column(String(1000), nullable=False)
    file_size    = Column(Integer, default=0)
    mime_type    = Column(String(100))
    folder_id    = Column(Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True)
    client_id    = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=True)
    uploaded_by  = Column(Integer, ForeignKey("users.id"))
    description  = Column(Text)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    folder   = relationship("Folder", back_populates="files")
    client   = relationship("Client")
    uploader = relationship("User")
