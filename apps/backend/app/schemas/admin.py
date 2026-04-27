"""
Admin schemas
Pydantic models for admin approval, monitoring, and review endpoints.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


ApprovalStatus = Literal["pending", "approved", "rejected"]
ApprovalRole = Literal["beneficiary", "vendor"]
AllocationStatus = Literal[
    "pending_payment",
    "allocated",
    "no_eligible_beneficiary",
    "failed",
    "refunded",
]


class AdminUsersSummary(BaseModel):
    total: int
    donors: int
    beneficiaries: int
    vendors: int
    pending_beneficiaries: int = 0
    pending_vendors: int = 0


class AdminProductsSummary(BaseModel):
    total: int = 0
    pending: int = 0
    approved: int = 0
    rejected: int = 0


class AdminOrdersSummary(BaseModel):
    total: int
    completed: int
    pending: int = 0


class AdminRedemptionsSummary(BaseModel):
    total_count: int
    total_amount: float


class AdminVouchersSummary(BaseModel):
    active_count: int
    total_balance: float


class AdminDonationsSummary(BaseModel):
    total_amount: float
    success_count: int = 0
    pending_count: int = 0
    failed_count: int = 0
    refunded_count: int = 0
    unallocated_success_count: int = 0


class AdminStatsResponse(BaseModel):
    users: AdminUsersSummary
    products: AdminProductsSummary
    vouchers: AdminVouchersSummary
    orders: AdminOrdersSummary
    redemptions: AdminRedemptionsSummary
    donations: AdminDonationsSummary


class ApprovalUpdateRequest(BaseModel):
    approval_status: ApprovalStatus
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class AdminUserApprovalItem(BaseModel):
    user_id: UUID
    full_name: str
    role: ApprovalRole
    approval_status: ApprovalStatus
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    family_size: Optional[int] = None
    vouchers_balance: Optional[Decimal] = None
    latest_fies_score: Optional[int] = None
    latest_fies_classification: Optional[str] = None
    latest_survey_date: Optional[datetime] = None

    store_name: Optional[str] = None
    store_address: Optional[str] = None

    model_config = ConfigDict(from_attributes=False)


class AdminUserApprovalListResponse(BaseModel):
    items: list[AdminUserApprovalItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminProductReviewItem(BaseModel):
    id: UUID
    vendor_id: UUID
    vendor_store_name: Optional[str] = None
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    name: str
    description: Optional[str] = None
    price: Decimal
    voucher_price: Decimal
    stock_quantity: int
    unit: str
    approval_status: ApprovalStatus
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=False)


class AdminProductReviewListResponse(BaseModel):
    items: list[AdminProductReviewItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminDonationItem(BaseModel):
    id: UUID
    donor_id: UUID
    donor_name: Optional[str] = None
    recipient_id: Optional[UUID] = None
    recipient_name: Optional[str] = None
    amount: Decimal
    type: str
    payment_method: str
    status: str
    midtrans_transaction_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    voucher_created: bool = False
    allocated_beneficiaries: int = 0
    allocated_total: Decimal = Decimal("0")
    allocation_status: AllocationStatus

    model_config = ConfigDict(from_attributes=False)


class AdminDonationListResponse(BaseModel):
    items: list[AdminDonationItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminBeneficiaryEligibilityItem(BaseModel):
    user_id: UUID
    full_name: str
    approval_status: ApprovalStatus
    family_size: int
    vouchers_balance: Decimal
    latest_fies_score: Optional[int] = None
    latest_fies_classification: Optional[str] = None
    latest_survey_date: Optional[datetime] = None
    has_current_month_survey: bool = False
    eligible_for_allocation: bool = False
    allocation_month: date

    model_config = ConfigDict(from_attributes=False)


class AdminBeneficiaryEligibilityListResponse(BaseModel):
    items: list[AdminBeneficiaryEligibilityItem]
    total: int
    page: int
    page_size: int
    total_pages: int
