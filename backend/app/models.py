from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
    Enum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ReconciliationStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TransactionStatus(str, enum.Enum):
    MATCHED = "matched"
    UNMATCHED = "unmatched"
    PENDING = "pending"


class ExceptionSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Transaction(Base):
    """Represents a single financial transaction from a source or bank file."""

    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(100), unique=True, index=True, nullable=False)
    source = Column(String(50), nullable=False, comment="e.g. 'internal' or 'bank'")

    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="INR")
    description = Column(Text, nullable=True)
    reference_number = Column(String(100), nullable=True, index=True)

    status = Column(
        Enum(TransactionStatus),
        default=TransactionStatus.PENDING,
        nullable=False,
    )

    transaction_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship: a transaction may belong to a reconciliation run
    reconciliation_run_id = Column(
        Integer, ForeignKey("reconciliation_runs.id"), nullable=True
    )
    reconciliation_run = relationship("ReconciliationRun", back_populates="transactions")

    # Relationship: exceptions raised for this transaction
    exceptions = relationship("Exception", back_populates="transaction")

    def __repr__(self):
        return (
            f"<Transaction id={self.id} txn_id={self.transaction_id} "
            f"amount={self.amount} status={self.status}>"
        )


class ReconciliationRun(Base):
    """Tracks a single reconciliation job execution."""

    __tablename__ = "reconciliation_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_name = Column(String(200), nullable=True)

    status = Column(
        Enum(ReconciliationStatus),
        default=ReconciliationStatus.PENDING,
        nullable=False,
    )

    # File metadata
    internal_file_name = Column(String(255), nullable=True)
    bank_file_name = Column(String(255), nullable=True)

    # Summary statistics (populated after completion)
    total_transactions = Column(Integer, default=0)
    matched_count = Column(Integer, default=0)
    unmatched_count = Column(Integer, default=0)
    exception_count = Column(Integer, default=0)

    # AI-generated summary / insights
    ai_summary = Column(Text, nullable=True)
    ai_insights = Column(Text, nullable=True)

    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    transactions = relationship("Transaction", back_populates="reconciliation_run")
    exceptions = relationship("Exception", back_populates="reconciliation_run")

    def __repr__(self):
        return (
            f"<ReconciliationRun id={self.id} status={self.status} "
            f"matched={self.matched_count}/{self.total_transactions}>"
        )


class Exception(Base):
    """Records a discrepancy or error found during reconciliation."""

    __tablename__ = "exceptions"

    id = Column(Integer, primary_key=True, index=True)

    exception_type = Column(
        String(100),
        nullable=False,
        comment="e.g. 'amount_mismatch', 'missing_transaction', 'duplicate'",
    )
    severity = Column(
        Enum(ExceptionSeverity),
        default=ExceptionSeverity.MEDIUM,
        nullable=False,
    )
    description = Column(Text, nullable=True)
    resolution = Column(Text, nullable=True)

    # Identifiers
    payment_id = Column(String(100), nullable=True, index=True)
    order_id = Column(String(100), nullable=True, index=True)
    exception_date = Column(String(50), nullable=True)

    # Amount discrepancy details
    internal_amount = Column(Float, nullable=True)
    bank_amount = Column(Float, nullable=True)
    discrepancy_amount = Column(Float, nullable=True)

    is_resolved = Column(Integer, default=0)  # 0 = False, 1 = True (SQLite bool)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(String(100), nullable=True)

    # AI Analysis persistent fields
    ai_explanation = Column(Text, nullable=True)
    ai_root_cause = Column(Text, nullable=True)
    ai_suggested_action = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


    # Foreign keys
    transaction_id = Column(
        Integer, ForeignKey("transactions.id"), nullable=True
    )
    reconciliation_run_id = Column(
        Integer, ForeignKey("reconciliation_runs.id"), nullable=False
    )

    # Relationships
    transaction = relationship("Transaction", back_populates="exceptions")
    reconciliation_run = relationship("ReconciliationRun", back_populates="exceptions")

    def __repr__(self):
        return (
            f"<Exception id={self.id} type={self.exception_type} "
            f"severity={self.severity} resolved={bool(self.is_resolved)}>"
        )
