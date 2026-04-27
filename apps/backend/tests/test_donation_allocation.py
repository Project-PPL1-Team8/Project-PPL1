from datetime import datetime, timedelta, date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import FIESSurvey  # noqa: F401
from app.models.donation import Donation, DonationStatusEnum, DonationTypeEnum, Voucher
from app.models.user import BeneficiaryProfile, DonorProfile, UserProfile
from app.services.donation_allocation_service import DonationAllocationService
from app.services.donation_service import DonationService


def _build_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autocommit=False, autoflush=False)()
    return session, engine


def _create_donor(db):
    donor_user_id = uuid4()
    db.add(UserProfile(user_id=donor_user_id, full_name="Donor Test"))
    db.add(
        DonorProfile(
            user_id=donor_user_id,
            total_donated=Decimal("0"),
            children_sponsored=0,
            subscription_status="inactive",
        )
    )
    return donor_user_id


def _create_beneficiary(db, name: str, approval_status: str = "approved"):
    beneficiary_user_id = uuid4()
    db.add(UserProfile(user_id=beneficiary_user_id, full_name=name))
    db.add(
        BeneficiaryProfile(
            user_id=beneficiary_user_id,
            family_size=3,
            approval_status=approval_status,
            vouchers_balance=Decimal("0"),
        )
    )
    return beneficiary_user_id


def _add_survey(db, beneficiary_id, score: int, survey_date: datetime):
    db.add(
        FIESSurvey(
            beneficiary_id=beneficiary_id,
            responses={f"q{i}": 1 for i in range(1, 9)},
            score=score,
            classification=FIESSurvey.classify_score(score),
            survey_date=survey_date,
            survey_month=survey_date.month,
            survey_year=survey_date.year,
        )
    )


def test_successful_donation_allocates_to_current_month_beneficiaries_by_priority():
    db, engine = _build_session()
    try:
        donor_id = _create_donor(db)

        severe_id = _create_beneficiary(db, "Severe")
        moderate_id = _create_beneficiary(db, "Moderate")
        secure_id = _create_beneficiary(db, "Secure")
        stale_id = _create_beneficiary(db, "Stale")
        pending_id = _create_beneficiary(db, "Pending", approval_status="pending")

        now = datetime.utcnow()
        _add_survey(db, severe_id, 8, now)
        _add_survey(db, moderate_id, 4, now)
        _add_survey(db, secure_id, 1, now)
        _add_survey(db, stale_id, 7, now - timedelta(days=40))
        _add_survey(db, pending_id, 7, now)

        donation = Donation(
            donor_id=donor_id,
            amount=Decimal("900000.00"),
            type=DonationTypeEnum.one_time,
            status=DonationStatusEnum.pending,
            payment_method="qris",
        )
        db.add(donation)
        db.commit()

        result = DonationAllocationService.process_successful_donation(db, str(donation.id))

        vouchers = db.query(Voucher).order_by(Voucher.balance.desc()).all()
        balances = {str(voucher.beneficiary_id): voucher.balance for voucher in vouchers}
        donor = db.query(DonorProfile).filter(DonorProfile.user_id == donor_id).first()
        metrics = DonationService.get_impact_metrics(db, str(donor_id))

        assert result["success"] is True
        assert result["voucher_created"] is True
        assert result["allocated_beneficiaries"] == 3
        assert len(vouchers) == 3
        assert sum((voucher.balance for voucher in vouchers), Decimal("0")) == Decimal("900000.00")
        assert str(stale_id) not in balances
        assert str(pending_id) not in balances
        assert balances[str(severe_id)] > balances[str(moderate_id)] > balances[str(secure_id)]
        assert balances[str(secure_id)] > Decimal("0")
        assert vouchers[0].expiry_date == DonationAllocationService._add_months(
            date.today(),
            3,
        )
        assert donor is not None
        assert donor.total_donated == Decimal("900000.00")
        assert metrics["total_children_helped"] == 3

    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


def test_successful_donation_without_eligible_survey_creates_no_voucher():
    db, engine = _build_session()
    try:
        donor_id = _create_donor(db)
        inactive_id = _create_beneficiary(db, "Inactive")
        _add_survey(db, inactive_id, 8, datetime.utcnow() - timedelta(days=45))

        donation = Donation(
            donor_id=donor_id,
            amount=Decimal("500000.00"),
            type=DonationTypeEnum.one_time,
            status=DonationStatusEnum.pending,
            payment_method="qris",
        )
        db.add(donation)
        db.commit()

        result = DonationAllocationService.process_successful_donation(db, str(donation.id))
        db.refresh(donation)

        donor = db.query(DonorProfile).filter(DonorProfile.user_id == donor_id).first()
        vouchers = db.query(Voucher).all()

        assert donation.status == DonationStatusEnum.success
        assert result["voucher_created"] is False
        assert result["allocated_beneficiaries"] == 0
        assert vouchers == []
        assert donor is not None
        assert donor.total_donated == Decimal("500000.00")

    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
