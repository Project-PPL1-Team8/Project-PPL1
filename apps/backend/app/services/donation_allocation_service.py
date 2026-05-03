"""
Donation allocation service.

Marks a donation as successful and allocates its value across eligible
beneficiaries based on the latest monthly FIES survey.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP
from calendar import monthrange
import logging
import uuid
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.models.cart import VoucherTransaction, VoucherTransactionTypeEnum
from app.models.donation import Donation, DonationStatusEnum, Voucher, VoucherStatusEnum
from app.models.nutrition import FIESSurvey
from app.models.user import BeneficiaryProfile, DonorProfile

logger = logging.getLogger(__name__)

CENT = Decimal("0.01")
BASE_EQUAL_SHARE_RATIO = Decimal("0.40")
PRIORITY_BONUS = {
    "severe": Decimal("2.0"),
    "moderate": Decimal("1.0"),
    "food_secure": Decimal("0.0"),
}
CLASSIFICATION_RANK = {
    "severe": 3,
    "moderate": 2,
    "food_secure": 1,
}
VOUCHER_VALIDITY_MONTHS = 3


@dataclass
class AllocationCandidate:
    beneficiary: BeneficiaryProfile
    survey: FIESSurvey
    priority_weight: Decimal
    sort_rank: tuple[int, int, int]


class DonationAllocationService:
    """Real donation allocation flow based on FIES eligibility and priority."""

    @staticmethod
    def _to_uuid(value: Optional[str | UUID]) -> Optional[UUID]:
        if value is None:
            return None
        if isinstance(value, UUID):
            return value
        return UUID(str(value))

    @staticmethod
    def process_successful_donation(
        db: Session,
        donation_id: str | UUID,
        transaction_id: Optional[str] = None,
    ) -> dict:
        donation_uuid = DonationAllocationService._to_uuid(donation_id)
        if donation_uuid is None:
            raise ValueError("Donation ID is required")

        donation = db.query(Donation).filter(Donation.id == donation_uuid).first()
        if not donation:
            raise ValueError(f"Donation {donation_id} not found")

        if donation.status != DonationStatusEnum.pending:
            raise ValueError(
                f"Donation status is {donation.status.value}, must be '{DonationStatusEnum.pending.value}'"
            )

        donation.status = DonationStatusEnum.success
        donation.midtrans_transaction_id = transaction_id or f"ALLOC-{uuid.uuid4().hex[:12].upper()}"

        allocated_at = datetime.utcnow()
        candidates = DonationAllocationService._get_eligible_candidates(
            db=db,
            allocation_month=allocated_at.date(),
            recipient_id=donation.recipient_id,
        )

        allocations: list[dict] = []
        if candidates:
            allocations = DonationAllocationService._allocate_to_candidates(
                db=db,
                donation=donation,
                allocated_at=allocated_at,
                candidates=candidates,
            )

            if len(allocations) == 1:
                donation.recipient_id = DonationAllocationService._to_uuid(
                    allocations[0]["beneficiary_id"]
                )
            elif donation.recipient_id and len(allocations) > 1:
                donation.recipient_id = None
        elif donation.recipient_id:
            logger.warning(
                "Recipient %s for donation %s is not eligible for allocation in %s-%s",
                donation.recipient_id,
                donation.id,
                allocated_at.year,
                allocated_at.month,
            )

        DonationAllocationService._update_donor_metrics(db, donation.donor_id, donation.amount)

        db.commit()
        db.refresh(donation)

        impact = DonationAllocationService._calculate_impact(donation, allocations)
        return {
            "success": True,
            "donation_id": str(donation.id),
            "amount": float(donation.amount or Decimal("0")),
            "transaction_id": donation.midtrans_transaction_id,
            "voucher_created": bool(allocations),
            "allocated_beneficiaries": len(allocations),
            "allocations": allocations,
            "impact": impact,
        }

    @staticmethod
    def _get_eligible_candidates(
        db: Session,
        allocation_month: date,
        recipient_id: Optional[UUID],
    ) -> list[AllocationCandidate]:
        latest_survey_subquery = (
            db.query(
                FIESSurvey.beneficiary_id.label("beneficiary_id"),
                func.max(FIESSurvey.survey_date).label("latest_survey_date"),
            )
            .group_by(FIESSurvey.beneficiary_id)
            .subquery()
        )

        query = (
            db.query(BeneficiaryProfile, FIESSurvey)
            .join(
                latest_survey_subquery,
                latest_survey_subquery.c.beneficiary_id == BeneficiaryProfile.user_id,
            )
            .join(
                FIESSurvey,
                and_(
                    FIESSurvey.beneficiary_id == latest_survey_subquery.c.beneficiary_id,
                    FIESSurvey.survey_date == latest_survey_subquery.c.latest_survey_date,
                ),
            )
            .filter(
                BeneficiaryProfile.is_active.is_(True),
                BeneficiaryProfile.approval_status == "approved",
                FIESSurvey.survey_year == allocation_month.year,
                FIESSurvey.survey_month == allocation_month.month,
            )
        )

        if recipient_id:
            query = query.filter(BeneficiaryProfile.user_id == recipient_id)

        rows = query.all()
        candidates = [
            DonationAllocationService._build_candidate(beneficiary, survey)
            for beneficiary, survey in rows
        ]
        candidates.sort(key=lambda candidate: candidate.sort_rank, reverse=True)
        return candidates

    @staticmethod
    def _build_candidate(
        beneficiary: BeneficiaryProfile,
        survey: FIESSurvey,
    ) -> AllocationCandidate:
        classification = survey.classification or "food_secure"
        balance = Decimal(beneficiary.vouchers_balance or Decimal("0"))
        priority_weight = (
            Decimal("1.0")
            + PRIORITY_BONUS.get(classification, Decimal("0.0"))
            + (Decimal(survey.score or 0) / Decimal("8"))
        )
        balance_rank = -int((balance * 100).to_integral_value(rounding=ROUND_HALF_UP))
        sort_rank = (
            CLASSIFICATION_RANK.get(classification, 0),
            int(survey.score or 0),
            balance_rank,
        )
        return AllocationCandidate(
            beneficiary=beneficiary,
            survey=survey,
            priority_weight=priority_weight,
            sort_rank=sort_rank,
        )

    @staticmethod
    def _allocate_to_candidates(
        db: Session,
        donation: Donation,
        allocated_at: datetime,
        candidates: list[AllocationCandidate],
    ) -> list[dict]:
        allocations_by_beneficiary = DonationAllocationService._split_amount(
            donation.amount,
            candidates,
        )
        expiry_date = DonationAllocationService._add_months(
            allocated_at.date(),
            VOUCHER_VALIDITY_MONTHS,
        )

        created_allocations: list[dict] = []
        for candidate in candidates:
            allocation_amount = allocations_by_beneficiary.get(candidate.beneficiary.user_id)
            if allocation_amount is None or allocation_amount <= 0:
                continue

            voucher = Voucher(
                code=DonationAllocationService._generate_voucher_code(),
                beneficiary_id=candidate.beneficiary.user_id,
                donation_id=donation.id,
                balance=allocation_amount,
                allocated_date=allocated_at,
                expiry_date=expiry_date,
                status=VoucherStatusEnum.active,
            )
            db.add(voucher)
            db.flush()

            db.add(
                VoucherTransaction(
                    voucher_id=voucher.id,
                    transaction_type=VoucherTransactionTypeEnum.allocated,
                    amount=allocation_amount,
                )
            )

            current_balance = Decimal(candidate.beneficiary.vouchers_balance or Decimal("0"))
            candidate.beneficiary.vouchers_balance = current_balance + allocation_amount

            created_allocations.append(
                {
                    "beneficiary_id": str(candidate.beneficiary.user_id),
                    "voucher_id": str(voucher.id),
                    "voucher_code": voucher.code,
                    "amount": float(allocation_amount),
                    "priority_classification": candidate.survey.classification,
                    "priority_score": candidate.survey.score,
                    "expiry_date": expiry_date.isoformat(),
                }
            )

        return created_allocations

    @staticmethod
    def _split_amount(
        total_amount: Decimal,
        candidates: list[AllocationCandidate],
    ) -> dict[UUID, Decimal]:
        total_cents = DonationAllocationService._to_cents(total_amount)
        if total_cents <= 0 or not candidates:
            return {}

        if len(candidates) == 1:
            return {
                candidates[0].beneficiary.user_id: DonationAllocationService._from_cents(total_cents)
            }

        base_pool_cents = int(
            (Decimal(total_cents) * BASE_EQUAL_SHARE_RATIO).to_integral_value(
                rounding=ROUND_FLOOR
            )
        )
        weighted_pool_cents = total_cents - base_pool_cents

        base_shares = DonationAllocationService._distribute_cents(
            total_cents=base_pool_cents,
            weights=[Decimal("1")] * len(candidates),
            candidates=candidates,
        )
        weighted_shares = DonationAllocationService._distribute_cents(
            total_cents=weighted_pool_cents,
            weights=[candidate.priority_weight for candidate in candidates],
            candidates=candidates,
        )

        allocation_map: dict[UUID, Decimal] = {}
        for index, candidate in enumerate(candidates):
            cents = base_shares[index] + weighted_shares[index]
            allocation_map[candidate.beneficiary.user_id] = DonationAllocationService._from_cents(
                cents
            )
        return allocation_map

    @staticmethod
    def _distribute_cents(
        total_cents: int,
        weights: list[Decimal],
        candidates: list[AllocationCandidate],
    ) -> list[int]:
        if total_cents <= 0 or not candidates:
            return [0] * len(candidates)

        safe_weights = [weight if weight > 0 else Decimal("1") for weight in weights]
        total_weight = sum(safe_weights, Decimal("0"))
        if total_weight <= 0:
            safe_weights = [Decimal("1")] * len(candidates)
            total_weight = Decimal(len(candidates))

        exact_shares = [
            (Decimal(total_cents) * weight) / total_weight for weight in safe_weights
        ]
        floor_shares = [
            int(exact.to_integral_value(rounding=ROUND_FLOOR)) for exact in exact_shares
        ]
        remaining = total_cents - sum(floor_shares)

        remainders = [exact - floor for exact, floor in zip(exact_shares, floor_shares)]
        distribution_order = sorted(
            range(len(candidates)),
            key=lambda idx: (remainders[idx], candidates[idx].sort_rank),
            reverse=True,
        )

        for idx in distribution_order[:remaining]:
            floor_shares[idx] += 1

        return floor_shares

    @staticmethod
    def _update_donor_metrics(db: Session, donor_id: UUID, amount: Decimal) -> None:
        donor = db.query(DonorProfile).filter(DonorProfile.user_id == donor_id).first()
        if not donor:
            logger.warning("Donor profile not found for %s", donor_id)
            return

        current_total = Decimal(donor.total_donated or Decimal("0"))
        donor.total_donated = current_total + Decimal(amount or Decimal("0"))

    @staticmethod
    def _calculate_impact(donation: Donation, allocations: list[dict]) -> dict:
        amount = float(donation.amount or Decimal("0"))
        units = int(amount // 500000)
        children_helped = len(allocations)
        days_of_support = units * 1000
        months_of_support = VOUCHER_VALIDITY_MONTHS if allocations else 0

        if children_helped <= 0:
            message = "Donasi berhasil, tetapi belum ada penerima yang memenuhi syarat alokasi bulan ini."
        elif children_helped == 1:
            message = "Donasi berhasil dialokasikan ke 1 penerima sesuai prioritas FIES bulan ini."
        else:
            message = (
                f"Donasi berhasil dialokasikan ke {children_helped} penerima sesuai prioritas "
                "FIES bulan ini."
            )

        return {
            "children_helped": children_helped,
            "months_of_support": months_of_support,
            "days_of_support": days_of_support,
            "message": message,
        }

    @staticmethod
    def _generate_voucher_code() -> str:
        return f"VCH-{datetime.utcnow().year}-{uuid.uuid4().hex[:6].upper()}"

    @staticmethod
    def _to_cents(amount: Decimal) -> int:
        normalized = Decimal(amount or Decimal("0"))
        return int((normalized * 100).to_integral_value(rounding=ROUND_HALF_UP))

    @staticmethod
    def _from_cents(cents: int) -> Decimal:
        return (Decimal(cents) / Decimal("100")).quantize(CENT)

    @staticmethod
    def _add_months(base_date: date, months: int) -> date:
        total_month = base_date.month - 1 + months
        year = base_date.year + (total_month // 12)
        month = (total_month % 12) + 1
        day = min(base_date.day, monthrange(year, month)[1])
        return date(year, month, day)
