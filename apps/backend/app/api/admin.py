"""
Admin API
Handles admin dashboard stats, approvals, monitoring, and exports.
"""
from datetime import date
import csv
import io
import logging
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.middleware.auth import AuthenticatedUser, RequireRole
from app.models.donation import Donation, DonationStatusEnum, Voucher, VoucherRedemption
from app.models.nutrition import AuditLog, FIESSurvey
from app.models.product import Order, Product
from app.models.user import BeneficiaryProfile, DonorProfile, UserProfile, VendorProfile
from app.schemas.admin import (
    AdminBeneficiaryEligibilityItem,
    AdminBeneficiaryEligibilityListResponse,
    AdminDonationItem,
    AdminDonationListResponse,
    AdminProductReviewItem,
    AdminProductReviewListResponse,
    AdminStatsResponse,
    AdminUserItem,
    AdminUserListResponse,
    AdminUserApprovalItem,
    AdminUserApprovalListResponse,
    ApprovalUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _paginate(items: list, page: int, page_size: int) -> tuple[list, int]:
    start = (page - 1) * page_size
    end = start + page_size
    total = len(items)
    return items[start:end], total


def _total_pages(total: int, page_size: int) -> int:
    return (total + page_size - 1) // page_size if total > 0 else 0


def _normalize_status(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def _record_audit_log(
    db: Session,
    actor_user_id: UUID,
    action: str,
    entity_type: str,
    entity_id: UUID,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
) -> None:
    actor_exists = db.query(UserProfile.user_id).filter(UserProfile.user_id == actor_user_id).first()
    db.add(
        AuditLog(
            user_id=actor_user_id if actor_exists else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
        )
    )


def _latest_survey_lookup(db: Session, beneficiary_ids: list[UUID]) -> dict[UUID, FIESSurvey]:
    if not beneficiary_ids:
        return {}

    latest_survey_subquery = (
        db.query(
            FIESSurvey.beneficiary_id.label("beneficiary_id"),
            func.max(FIESSurvey.survey_date).label("latest_survey_date"),
        )
        .filter(FIESSurvey.beneficiary_id.in_(beneficiary_ids))
        .group_by(FIESSurvey.beneficiary_id)
        .subquery()
    )

    surveys = (
        db.query(FIESSurvey)
        .join(
            latest_survey_subquery,
            and_(
                FIESSurvey.beneficiary_id == latest_survey_subquery.c.beneficiary_id,
                FIESSurvey.survey_date == latest_survey_subquery.c.latest_survey_date,
            ),
        )
        .all()
    )
    return {survey.beneficiary_id: survey for survey in surveys}


def _build_beneficiary_approval_item(
    user_profile: UserProfile,
    profile: BeneficiaryProfile,
    latest_survey: Optional[FIESSurvey],
) -> AdminUserApprovalItem:
    return AdminUserApprovalItem(
        user_id=user_profile.user_id,
        full_name=user_profile.full_name,
        role="beneficiary",
        approval_status=profile.approval_status,
        phone=user_profile.phone,
        address=user_profile.address,
        created_at=user_profile.created_at,
        updated_at=user_profile.updated_at,
        family_size=profile.family_size,
        vouchers_balance=Decimal(profile.vouchers_balance or Decimal("0")),
        latest_fies_score=latest_survey.score if latest_survey else None,
        latest_fies_classification=latest_survey.classification if latest_survey else None,
        latest_survey_date=latest_survey.survey_date if latest_survey else None,
    )


def _build_vendor_approval_item(
    user_profile: UserProfile,
    profile: VendorProfile,
) -> AdminUserApprovalItem:
    return AdminUserApprovalItem(
        user_id=user_profile.user_id,
        full_name=user_profile.full_name,
        role="vendor",
        approval_status=profile.approval_status,
        phone=user_profile.phone,
        address=user_profile.address,
        created_at=user_profile.created_at,
        updated_at=user_profile.updated_at,
        store_name=profile.store_name,
        store_address=profile.store_address,
    )


def _build_admin_user_item(
    user_profile: UserProfile,
    role: str,
    approval_status: str,
) -> AdminUserItem:
    return AdminUserItem(
        user_id=user_profile.user_id,
        full_name=user_profile.full_name,
        role=role,
        approval_status=approval_status,
        phone=user_profile.phone,
        address=user_profile.address,
        created_at=user_profile.created_at,
        updated_at=user_profile.updated_at,
    )


def _build_product_review_item(product: Product) -> AdminProductReviewItem:
    return AdminProductReviewItem(
        id=product.id,
        vendor_id=product.vendor_id,
        vendor_store_name=product.vendor_profile.store_name if product.vendor_profile else None,
        category_id=product.category_id,
        category_name=product.category.name if product.category else None,
        name=product.name,
        description=product.description,
        price=product.price,
        voucher_price=product.voucher_price,
        stock_quantity=product.stock_quantity,
        unit=product.unit,
        approval_status=product.approval_status,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


def _resolve_donation_recipient_name(donation: Donation) -> tuple[Optional[UUID], Optional[str]]:
    allocated_beneficiaries = [
        voucher.beneficiary_profile
        for voucher in donation.vouchers
        if voucher.beneficiary_profile is not None
    ]
    unique_profiles = {
        str(profile.user_id): profile
        for profile in allocated_beneficiaries
    }

    if len(unique_profiles) == 1:
        profile = next(iter(unique_profiles.values()))
        name = profile.user_profile.full_name if profile.user_profile else None
        return profile.user_id, name

    if len(unique_profiles) > 1:
        return None, f"{len(unique_profiles)} penerima teralokasi"

    return donation.recipient_id, None


def _build_admin_donation_item(donation: Donation) -> AdminDonationItem:
    allocated_total = sum((Decimal(voucher.balance or Decimal("0")) for voucher in donation.vouchers), Decimal("0"))
    allocated_beneficiaries = len({str(voucher.beneficiary_id) for voucher in donation.vouchers})

    if donation.status == DonationStatusEnum.pending:
        allocation_status = "pending_payment"
    elif donation.status == DonationStatusEnum.failed:
        allocation_status = "failed"
    elif donation.status == DonationStatusEnum.refunded:
        allocation_status = "refunded"
    elif allocated_beneficiaries > 0:
        allocation_status = "allocated"
    else:
        allocation_status = "no_eligible_beneficiary"

    recipient_id, recipient_name = _resolve_donation_recipient_name(donation)

    return AdminDonationItem(
        id=donation.id,
        donor_id=donation.donor_id,
        donor_name=(
            donation.donor_profile.user_profile.full_name
            if donation.donor_profile and donation.donor_profile.user_profile
            else None
        ),
        recipient_id=recipient_id,
        recipient_name=recipient_name,
        amount=donation.amount,
        type=donation.type.value if hasattr(donation.type, "value") else str(donation.type),
        payment_method=donation.payment_method,
        status=donation.status.value if hasattr(donation.status, "value") else str(donation.status),
        midtrans_transaction_id=donation.midtrans_transaction_id,
        created_at=donation.created_at,
        updated_at=donation.updated_at,
        voucher_created=allocated_beneficiaries > 0,
        allocated_beneficiaries=allocated_beneficiaries,
        allocated_total=allocated_total,
        allocation_status=allocation_status,
    )


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """Get admin dashboard statistics."""
    total_users = db.query(UserProfile).count()
    total_donors = db.query(DonorProfile).count()
    total_beneficiaries = db.query(BeneficiaryProfile).count()
    total_vendors = db.query(VendorProfile).count()
    pending_beneficiaries = db.query(BeneficiaryProfile).filter(BeneficiaryProfile.approval_status == "pending").count()
    pending_vendors = db.query(VendorProfile).filter(VendorProfile.approval_status == "pending").count()

    active_vouchers = db.query(func.count(Voucher.id)).filter(
        Voucher.balance > 0,
        Voucher.status == "active",
    ).scalar() or 0
    total_voucher_balance = db.query(func.sum(Voucher.balance)).filter(Voucher.balance > 0).scalar() or 0

    total_orders = db.query(Order).count()
    completed_orders = db.query(Order).filter(Order.status == "completed").count()
    pending_orders = db.query(Order).filter(Order.status == "pending").count()

    total_redemptions = db.query(VoucherRedemption).count()
    total_redemption_amount = db.query(func.sum(VoucherRedemption.amount)).scalar() or 0

    total_products = db.query(Product).filter(Product.is_active).count()
    pending_products = db.query(Product).filter(Product.is_active, Product.approval_status == "pending").count()
    approved_products = db.query(Product).filter(Product.is_active, Product.approval_status == "approved").count()
    rejected_products = db.query(Product).filter(Product.is_active, Product.approval_status == "rejected").count()

    total_donations = db.query(func.sum(Donation.amount)).filter(Donation.status == DonationStatusEnum.success).scalar() or 0
    success_count = db.query(Donation).filter(Donation.status == DonationStatusEnum.success).count()
    pending_count = db.query(Donation).filter(Donation.status == DonationStatusEnum.pending).count()
    failed_count = db.query(Donation).filter(Donation.status == DonationStatusEnum.failed).count()
    refunded_count = db.query(Donation).filter(Donation.status == DonationStatusEnum.refunded).count()
    unallocated_success_count = db.query(Donation).filter(
        Donation.status == DonationStatusEnum.success,
        ~Donation.vouchers.any(),
    ).count()

    return AdminStatsResponse(
        users={
            "total": total_users,
            "donors": total_donors,
            "beneficiaries": total_beneficiaries,
            "vendors": total_vendors,
            "pending_beneficiaries": pending_beneficiaries,
            "pending_vendors": pending_vendors,
        },
        products={
            "total": total_products,
            "pending": pending_products,
            "approved": approved_products,
            "rejected": rejected_products,
        },
        vouchers={
            "active_count": active_vouchers,
            "total_balance": float(total_voucher_balance or 0),
        },
        orders={
            "total": total_orders,
            "completed": completed_orders,
            "pending": pending_orders,
        },
        redemptions={
            "total_count": total_redemptions,
            "total_amount": float(total_redemption_amount or 0),
        },
        donations={
            "total_amount": float(total_donations or 0),
            "success_count": success_count,
            "pending_count": pending_count,
            "failed_count": failed_count,
            "refunded_count": refunded_count,
            "unallocated_success_count": unallocated_success_count,
        },
    )


@router.get("/users", response_model=AdminUserListResponse)
async def list_admin_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    role: Optional[str] = Query(None, description="user, beneficiary, donor, or vendor"),
    approval_status: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """List all user profiles for admin with role and approval filters."""
    normalized_role = _normalize_status(role)
    normalized_status = _normalize_status(approval_status)
    if normalized_role not in {None, "user", "beneficiary", "donor", "vendor"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role filter")
    if normalized_status not in {None, "pending", "approved", "rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")

    search_term = search.strip().lower() if search else None
    rows: list[AdminUserItem] = []

    base_query = db.query(UserProfile).filter(UserProfile.is_active)

    if search_term:
        base_query = base_query.filter(
            or_(
                UserProfile.full_name.ilike(f"%{search_term}%"),
                UserProfile.phone.ilike(f"%{search_term}%"),
                UserProfile.address.ilike(f"%{search_term}%"),
            )
        )

    user_profiles = (
        base_query
        .options(
            selectinload(UserProfile.donor_profile),
            selectinload(UserProfile.beneficiary_profile),
            selectinload(UserProfile.vendor_profile),
        )
        .order_by(UserProfile.created_at.desc())
        .all()
    )

    for user_profile in user_profiles:
        role_value: Optional[str] = None
        approval_status_value: Optional[str] = None

        if user_profile.donor_profile:
            role_value = "donor"
            approval_status_value = "approved"
        elif user_profile.beneficiary_profile:
            role_value = "beneficiary"
            approval_status_value = user_profile.beneficiary_profile.approval_status or "pending"
        elif user_profile.vendor_profile:
            role_value = "vendor"
            approval_status_value = user_profile.vendor_profile.approval_status or "pending"
        else:
            role_value = "user"
            approval_status_value = "approved"

        if normalized_role and role_value != normalized_role:
            continue
        if normalized_status and approval_status_value != normalized_status:
            continue

        rows.append(_build_admin_user_item(user_profile, role_value, approval_status_value))

    total = len(rows)
    paged_items, total = _paginate(rows, page, page_size)
    return AdminUserListResponse(
        items=paged_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=_total_pages(total, page_size),
    )


@router.get("/users/approvals", response_model=AdminUserApprovalListResponse)
async def list_user_approvals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[str] = Query(None, description="beneficiary or vendor"),
    approval_status: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """List beneficiary and vendor accounts that need admin review."""
    normalized_role = _normalize_status(role)
    normalized_status = _normalize_status(approval_status)
    if normalized_role not in {None, "beneficiary", "vendor"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role filter")
    if normalized_status not in {None, "pending", "approved", "rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")

    items: list[AdminUserApprovalItem] = []
    search_term = search.strip().lower() if search else None

    if normalized_role in (None, "beneficiary"):
        beneficiary_query = (
            db.query(UserProfile, BeneficiaryProfile)
            .join(BeneficiaryProfile, BeneficiaryProfile.user_id == UserProfile.user_id)
            .filter(UserProfile.is_active, BeneficiaryProfile.is_active)
        )
        if normalized_status:
            beneficiary_query = beneficiary_query.filter(BeneficiaryProfile.approval_status == normalized_status)
        if search_term:
            beneficiary_query = beneficiary_query.filter(UserProfile.full_name.ilike(f"%{search_term}%"))

        beneficiary_rows = beneficiary_query.order_by(UserProfile.created_at.desc()).all()
        survey_lookup = _latest_survey_lookup(db, [profile.user_id for _, profile in beneficiary_rows])
        items.extend(
            _build_beneficiary_approval_item(user_profile, profile, survey_lookup.get(profile.user_id))
            for user_profile, profile in beneficiary_rows
        )

    if normalized_role in (None, "vendor"):
        vendor_query = (
            db.query(UserProfile, VendorProfile)
            .join(VendorProfile, VendorProfile.user_id == UserProfile.user_id)
            .filter(UserProfile.is_active, VendorProfile.is_active)
        )
        if normalized_status:
            vendor_query = vendor_query.filter(VendorProfile.approval_status == normalized_status)
        if search_term:
            vendor_query = vendor_query.filter(
                (UserProfile.full_name.ilike(f"%{search_term}%"))
                | (VendorProfile.store_name.ilike(f"%{search_term}%"))
            )

        vendor_rows = vendor_query.order_by(UserProfile.created_at.desc()).all()
        items.extend(
            _build_vendor_approval_item(user_profile, profile)
            for user_profile, profile in vendor_rows
        )

    items.sort(key=lambda item: item.created_at, reverse=True)
    paged_items, total = _paginate(items, page, page_size)
    return AdminUserApprovalListResponse(
        items=paged_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=_total_pages(total, page_size),
    )


@router.patch("/users/{user_id}/approval", response_model=AdminUserApprovalItem)
async def update_user_approval(
    user_id: UUID,
    data: ApprovalUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """Approve or reject beneficiary and vendor accounts."""
    user_profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not user_profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    beneficiary_profile = db.query(BeneficiaryProfile).filter(BeneficiaryProfile.user_id == user_id).first()
    vendor_profile = db.query(VendorProfile).filter(VendorProfile.user_id == user_id).first()

    if beneficiary_profile:
        old_status = beneficiary_profile.approval_status
        beneficiary_profile.approval_status = data.approval_status
        _record_audit_log(
            db,
            current_user.user_id,
            action=f"beneficiary_{data.approval_status}",
            entity_type="beneficiary_profile",
            entity_id=beneficiary_profile.user_id,
            old_values={"approval_status": old_status},
            new_values={"approval_status": data.approval_status, "notes": data.notes},
        )
        db.commit()
        db.refresh(beneficiary_profile)
        latest_survey = _latest_survey_lookup(db, [beneficiary_profile.user_id]).get(beneficiary_profile.user_id)
        return _build_beneficiary_approval_item(user_profile, beneficiary_profile, latest_survey)

    if vendor_profile:
        old_status = vendor_profile.approval_status
        vendor_profile.approval_status = data.approval_status
        _record_audit_log(
            db,
            current_user.user_id,
            action=f"vendor_{data.approval_status}",
            entity_type="vendor_profile",
            entity_id=vendor_profile.user_id,
            old_values={"approval_status": old_status},
            new_values={"approval_status": data.approval_status, "notes": data.notes},
        )
        db.commit()
        db.refresh(vendor_profile)
        return _build_vendor_approval_item(user_profile, vendor_profile)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Only beneficiary and vendor accounts support approval workflow",
    )


@router.get("/products/reviews", response_model=AdminProductReviewListResponse)
async def list_product_reviews(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    approval_status: Optional[str] = Query(None, alias="status"),
    vendor_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """List product catalog submissions across approval states."""
    normalized_status = _normalize_status(approval_status)
    if normalized_status not in {None, "pending", "approved", "rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")

    query = (
        db.query(Product)
        .options(
            selectinload(Product.category),
            selectinload(Product.vendor_profile).selectinload(VendorProfile.user_profile),
        )
        .filter(Product.is_active)
    )
    if normalized_status:
        query = query.filter(Product.approval_status == normalized_status)
    if vendor_id:
        query = query.filter(Product.vendor_id == vendor_id)
    if search:
        query = query.filter(Product.name.ilike(f"%{search.strip()}%"))

    total = query.count()
    products = (
        query.order_by(Product.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return AdminProductReviewListResponse(
        items=[_build_product_review_item(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=_total_pages(total, page_size),
    )


@router.patch("/products/{product_id}/approval", response_model=AdminProductReviewItem)
async def update_product_approval(
    product_id: UUID,
    data: ApprovalUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """Approve or reject catalog products."""
    product = (
        db.query(Product)
        .options(
            selectinload(Product.category),
            selectinload(Product.vendor_profile).selectinload(VendorProfile.user_profile),
        )
        .filter(Product.id == product_id, Product.is_active)
        .first()
    )
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    old_status = product.approval_status
    product.approval_status = data.approval_status
    _record_audit_log(
        db,
        current_user.user_id,
        action=f"product_{data.approval_status}",
        entity_type="product",
        entity_id=product.id,
        old_values={"approval_status": old_status},
        new_values={"approval_status": data.approval_status, "notes": data.notes},
    )
    db.commit()
    db.refresh(product)

    return _build_product_review_item(product)


@router.get("/donations", response_model=AdminDonationListResponse)
async def list_admin_donations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    payment_status: Optional[str] = Query(None, alias="status"),
    allocation_status: Optional[str] = Query(None),
    donor_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """List all donations with payment and allocation visibility for admin."""
    normalized_payment_status = _normalize_status(payment_status)
    normalized_allocation_status = _normalize_status(allocation_status)
    allowed_payment_statuses = {None, "pending", "success", "failed", "refunded"}
    allowed_allocation_statuses = {None, "pending_payment", "allocated", "no_eligible_beneficiary", "failed", "refunded"}

    if normalized_payment_status not in allowed_payment_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")
    if normalized_allocation_status not in allowed_allocation_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid allocation_status filter")

    query = (
        db.query(Donation)
        .options(
            selectinload(Donation.donor_profile).selectinload(DonorProfile.user_profile),
            selectinload(Donation.vouchers)
            .selectinload(Voucher.beneficiary_profile)
            .selectinload(BeneficiaryProfile.user_profile),
        )
    )
    if normalized_payment_status:
        query = query.filter(Donation.status == normalized_payment_status)
    if donor_id:
        query = query.filter(Donation.donor_id == donor_id)

    donations = query.order_by(Donation.created_at.desc()).all()
    items = [_build_admin_donation_item(donation) for donation in donations]

    if normalized_allocation_status:
        items = [item for item in items if item.allocation_status == normalized_allocation_status]

    if search:
        search_term = search.strip().lower()
        items = [
            item
            for item in items
            if search_term in (item.donor_name or "").lower()
            or search_term in (item.recipient_name or "").lower()
            or search_term in (item.midtrans_transaction_id or "").lower()
        ]

    paged_items, total = _paginate(items, page, page_size)
    return AdminDonationListResponse(
        items=paged_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=_total_pages(total, page_size),
    )


@router.get("/beneficiaries/eligibility", response_model=AdminBeneficiaryEligibilityListResponse)
async def list_beneficiary_eligibility(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    approval_status: Optional[str] = Query(None, alias="status"),
    eligible_only: bool = Query(False),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """List beneficiary eligibility for monthly donation allocation."""
    normalized_status = _normalize_status(approval_status)
    if normalized_status not in {None, "pending", "approved", "rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")

    today = date.today()
    allocation_year = year or today.year
    allocation_month = month or today.month
    allocation_date = date(allocation_year, allocation_month, 1)

    query = (
        db.query(UserProfile, BeneficiaryProfile)
        .join(BeneficiaryProfile, BeneficiaryProfile.user_id == UserProfile.user_id)
        .filter(UserProfile.is_active, BeneficiaryProfile.is_active)
    )
    if normalized_status:
        query = query.filter(BeneficiaryProfile.approval_status == normalized_status)
    if search:
        query = query.filter(UserProfile.full_name.ilike(f"%{search.strip()}%"))

    rows = query.order_by(UserProfile.created_at.desc()).all()
    survey_lookup = _latest_survey_lookup(db, [profile.user_id for _, profile in rows])

    items: list[AdminBeneficiaryEligibilityItem] = []
    for user_profile, profile in rows:
        latest_survey = survey_lookup.get(profile.user_id)
        has_current_month_survey = bool(
            latest_survey
            and latest_survey.survey_year == allocation_year
            and latest_survey.survey_month == allocation_month
        )
        is_eligible = (
            profile.approval_status == "approved"
            and has_current_month_survey
        )

        item = AdminBeneficiaryEligibilityItem(
            user_id=user_profile.user_id,
            full_name=user_profile.full_name,
            approval_status=profile.approval_status,
            family_size=profile.family_size or 1,
            vouchers_balance=Decimal(profile.vouchers_balance or Decimal("0")),
            latest_fies_score=latest_survey.score if latest_survey else None,
            latest_fies_classification=latest_survey.classification if latest_survey else None,
            latest_survey_date=latest_survey.survey_date if latest_survey else None,
            has_current_month_survey=has_current_month_survey,
            eligible_for_allocation=is_eligible,
            allocation_month=allocation_date,
        )

        if not eligible_only or item.eligible_for_allocation:
            items.append(item)

    paged_items, total = _paginate(items, page, page_size)
    return AdminBeneficiaryEligibilityListResponse(
        items=paged_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=_total_pages(total, page_size),
    )


@router.get("/export/users")
async def export_users(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """Export users to CSV."""
    users = db.query(UserProfile).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["user_id", "full_name", "nik", "phone", "address", "role", "created_at"])

    for user in users:
        role = "unknown"
        if user.donor_profile:
            role = "donor"
        elif user.beneficiary_profile:
            role = "beneficiary"
        elif user.vendor_profile:
            role = "vendor"

        writer.writerow(
            [
                str(user.user_id),
                user.full_name,
                user.nik or "",
                user.phone or "",
                user.address or "",
                role,
                user.created_at.isoformat() if user.created_at else "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@router.get("/export/orders")
async def export_orders(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """Export orders to CSV."""
    query = db.query(Order)

    if start_date:
        query = query.filter(Order.created_at >= start_date)
    if end_date:
        query = query.filter(Order.created_at <= end_date)

    orders = query.order_by(Order.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["order_id", "beneficiary_id", "vendor_id", "total_amount", "status", "created_at"])

    for order in orders:
        writer.writerow(
            [
                str(order.id),
                str(order.beneficiary_id),
                str(order.vendor_id),
                float(order.total_amount or 0),
                order.status,
                order.created_at.isoformat() if order.created_at else "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


@router.get("/export/vouchers")
async def export_vouchers(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """Export vouchers to CSV."""
    vouchers = db.query(Voucher).order_by(Voucher.created_at.desc()).limit(1000).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["voucher_id", "code", "beneficiary_id", "balance", "status", "expiry_date", "created_at"])

    for voucher in vouchers:
        writer.writerow(
            [
                str(voucher.id),
                voucher.code,
                str(voucher.beneficiary_id),
                float(voucher.balance or 0),
                voucher.status,
                voucher.expiry_date.isoformat() if voucher.expiry_date else "",
                voucher.created_at.isoformat() if voucher.created_at else "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=vouchers.csv"},
    )


@router.get("/export/redemptions")
async def export_redemptions(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """Export voucher redemptions to CSV."""
    query = db.query(VoucherRedemption)

    if start_date:
        query = query.filter(VoucherRedemption.created_at >= start_date)
    if end_date:
        query = query.filter(VoucherRedemption.created_at <= end_date)

    redemptions = query.order_by(VoucherRedemption.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["redemption_id", "voucher_code", "order_id", "vendor_id", "amount", "created_at"])

    for redemption in redemptions:
        writer.writerow(
            [
                str(redemption.id),
                redemption.voucher.code if redemption.voucher else "",
                str(redemption.order_id),
                str(redemption.order.vendor_id) if redemption.order else "",
                float(redemption.amount or 0),
                redemption.created_at.isoformat() if redemption.created_at else "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=redemptions.csv"},
    )
