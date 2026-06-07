"""
Service Templates + Formation Obligations Models
نماذج قوالب الخدمات والتزامات التأسيس
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class ServiceTemplate(Base):
    __tablename__ = "service_templates"

    id          = Column(Integer, primary_key=True)
    name        = Column(String, nullable=False)
    service_type = Column(String, nullable=False)  # company_formation, ngo, insurance, custom
    description = Column(Text)
    is_default  = Column(Boolean, default=False)
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    steps = relationship(
        "ServiceTemplateStep",
        back_populates="template",
        order_by="ServiceTemplateStep.order_index",
        cascade="all, delete-orphan",
    )


class ServiceTemplateStep(Base):
    __tablename__ = "service_template_steps"

    id           = Column(Integer, primary_key=True)
    template_id  = Column(Integer, ForeignKey("service_templates.id"), nullable=False)
    name         = Column(String, nullable=False)
    description  = Column(Text)
    order_index  = Column(Integer, default=0)
    required_docs = Column(Text)   # JSON list
    default_days = Column(Integer, default=7)

    template = relationship("ServiceTemplate", back_populates="steps")


class FormationObligation(Base):
    __tablename__ = "formation_obligations"

    id          = Column(Integer, primary_key=True)
    case_id     = Column(Integer, ForeignKey("company_formation_cases.id"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("service_templates.id"), nullable=True)
    step_id     = Column(Integer, ForeignKey("service_template_steps.id"), nullable=True)

    name        = Column(String, nullable=False)
    description = Column(Text)
    status      = Column(String, default="not_started")  # not_started, in_progress, completed, late
    order_index = Column(Integer, default=0)
    due_date    = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes       = Column(Text)
    required_docs = Column(Text)  # JSON

    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    case          = relationship("CompanyFormationCase", backref="formation_obligations")
    assigned_user = relationship("User", foreign_keys=[assigned_to])
    step          = relationship("ServiceTemplateStep")
