from app.models.user import User, UserRole
from app.models.client import Client, ClientType, ClientStatus, TaxType
from app.models.client_contact import ClientContact
from app.models.invoice import Invoice, InvoiceItem, Payment, InvoiceStatus
from app.models.task import Task, TaskComment, TaskStatus, TaskPriority, TaskCategory
from app.models.document import Document, DocumentCategory
from app.models.tax import TaxReturn, TaxReturnType, TaxReturnStatus
from app.models.activity import ActivityLog

# CRM/ERP Models
from app.models.lead import Lead, LeadActivity, Meeting, FollowUp, LeadStatus, LeadSource
from app.models.quotation import Quotation, QuotationTemplate
from app.models.establishment import CompanyEstablishment, CompanyType, EstablishmentStatus
from app.models.obligation import TaxObligation, ObligationInstance, ObligationStatus, ObligationType, Notification
from app.models.collection import CollectionContract, CollectionPayment, MonthlyDue, CollectionType, PaymentStatus
from app.models.accounting import (AccAccount, AccJournalEntry, AccJournalLine,
                                   AccTransaction, AccTreasury, AccTreasuryTx,
                                   AccCheck, AccAdvance)
from app.models.eta import ETACredential, ETADocument
from app.models.settlement import EmployeeCustody, EmployeeSettlement, Appointment, GovernmentPaper
from app.models.payroll import Employee, PayrollRun, PayrollItem
from app.models.fixed_asset import FixedAsset, AssetDepreciation
from app.models.postal import InternalMail
from app.models.statement import FinancialStatement
from app.models.timesheet import TimeEntry

# New 2026-06-03 models
from app.models.permission import UserPermission
from app.models.company_document import CompanyDocument
from app.models.audit_log import AuditLog
from app.models.folder import Folder, FileItem
from app.models.client_portal import ClientPortalUser
from app.models.office_service import OfficeService, OfficeServiceTask

__all__ = [
    "User", "UserRole",
    "Client", "ClientType", "ClientStatus", "TaxType",
    "ClientContact",
    "Invoice", "InvoiceItem", "Payment", "InvoiceStatus",
    "Task", "TaskComment", "TaskStatus", "TaskPriority", "TaskCategory",
    "Document", "DocumentCategory",
    "TaxReturn", "TaxReturnType", "TaxReturnStatus",
    "ActivityLog",
    "Lead", "LeadActivity", "Meeting", "FollowUp", "LeadStatus", "LeadSource",
    "Quotation", "QuotationTemplate",
    "CompanyEstablishment", "CompanyType", "EstablishmentStatus",
    "TaxObligation", "ObligationInstance", "ObligationStatus", "ObligationType", "Notification",
    "CollectionContract", "CollectionPayment", "MonthlyDue", "CollectionType", "PaymentStatus",
]
