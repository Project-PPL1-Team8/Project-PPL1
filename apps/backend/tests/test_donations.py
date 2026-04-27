"""
Donation Tests
Tests for donation service logic, schemas, and enums
"""
from decimal import Decimal
from datetime import date, datetime
from uuid import uuid4

from app.database import Base, SessionLocal, engine
from app.models.donation import Donation, Voucher, DonationTypeEnum, DonationStatusEnum, VoucherStatusEnum
from app.models.subscription import Subscription, SubscriptionStatusEnum
from app.models.user import BeneficiaryProfile, DonorProfile, UserProfile
from app.schemas.donation import PaymentMethodEnum
from app.schemas.donation import DonationCreate, DonationResponse, DonationListResponse, ImpactMetrics
from app.services.donation_service import DonationService


def test_donation_status_enum():
    """Test donation status enum values"""
    assert DonationStatusEnum.pending.value == "pending"
    assert DonationStatusEnum.success.value == "success"
    assert DonationStatusEnum.failed.value == "failed"
    assert DonationStatusEnum.refunded.value == "refunded"


def test_donation_type_enum():
    """Test donation type enum values"""
    assert DonationTypeEnum.one_time.value == "one_time"
    assert DonationTypeEnum.subscription.value == "subscription"


def test_payment_method_enum():
    """Test payment method enum values"""
    assert PaymentMethodEnum.midtrans.value == "midtrans"
    assert PaymentMethodEnum.qris.value == "qris"
    assert PaymentMethodEnum.bank_transfer.value == "bank_transfer"
    assert PaymentMethodEnum.e_wallet.value == "e_wallet"


def test_donation_create_schema():
    """Test DonationCreate schema validation"""
    data = DonationCreate(
        amount=Decimal("300000"),
        type=DonationTypeEnum.one_time,
        payment_method=PaymentMethodEnum.qris,
    )
    assert data.amount == Decimal("300000")
    assert data.type == DonationTypeEnum.one_time


def test_donation_create_schema_invalid_amount():
    """Test DonationCreate rejects zero/negative amounts"""
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        DonationCreate(amount=Decimal("0"), type=DonationTypeEnum.one_time, payment_method=PaymentMethodEnum.qris)


def test_donation_response_schema():
    """Test DonationResponse schema"""
    donor_id = uuid4()
    donation_id = uuid4()
    data = DonationResponse(
        id=donation_id,
        donor_id=donor_id,
        amount=Decimal("300000"),
        type=DonationTypeEnum.one_time,
        payment_method=PaymentMethodEnum.qris,
        status=DonationStatusEnum.success,
        created_at=datetime.utcnow(),
    )
    assert data.amount == Decimal("300000")
    assert data.status == DonationStatusEnum.success


def test_donation_list_response_schema():
    """Test DonationListResponse schema"""
    data = DonationListResponse(items=[], total=0, page=1, page_size=10, total_pages=0)
    assert data.total == 0
    assert data.page == 1


def test_impact_metrics_schema():
    """Test ImpactMetrics schema"""
    data = ImpactMetrics(
        donor_id="test-donor",
        total_donated=Decimal("1000000"),
        total_children_helped=5,
        total_vouchers_allocated=10,
        donation_trend=[],
        geographic_distribution=[],
    )
    assert data.total_donated == Decimal("1000000")
    assert data.total_children_helped == 5


def test_voucher_status_enum():
    """Test voucher status enum values"""
    assert VoucherStatusEnum.active.value == "active"
    assert VoucherStatusEnum.redeemed.value == "redeemed"
    assert VoucherStatusEnum.expired.value == "expired"
    assert VoucherStatusEnum.cancelled.value == "cancelled"


def test_fies_classification_logic():
    """Test FIES classification logic from model"""
    from app.models.nutrition import FIESSurvey
    assert FIESSurvey.classify_score(0) == "food_secure"
    assert FIESSurvey.classify_score(2) == "food_secure"
    assert FIESSurvey.classify_score(3) == "moderate"
    assert FIESSurvey.classify_score(5) == "moderate"
    assert FIESSurvey.classify_score(6) == "severe"
    assert FIESSurvey.classify_score(8) == "severe"


def test_fies_score_calculation():
    """Test FIES score calculation"""
    from app.models.nutrition import FIESSurvey
    responses = {"q1": "yes", "q2": "no", "q3": "yes", "q4": "no", "q5": "no", "q6": "no", "q7": "no", "q8": "no"}
    score = FIESSurvey.calculate_score(responses)
    assert score == 2


def test_zscore_classification():
    """Test Z-Score classification logic"""
    from app.services.zscore_calculator import ZScoreCalculator
    assert ZScoreCalculator.classify_zscore(0) == "normal"
    assert ZScoreCalculator.classify_zscore(-1.5) == "normal"
    assert ZScoreCalculator.classify_zscore(-2.0) == "normal"
    assert ZScoreCalculator.classify_zscore(-2.5) == "moderate_malnourished"
    assert ZScoreCalculator.classify_zscore(-3.0) == "moderate_malnourished"
    assert ZScoreCalculator.classify_zscore(-3.5) == "severe_malnourished"


def test_zscore_calculation():
    """Test Z-Score calculation"""
    from app.services.zscore_calculator import ZScoreCalculator
    result = ZScoreCalculator.calculate_zscore(12.5, 14.0, 1.2)
    assert result == -1.25


def test_who_growth_standards():
    """Test WHO growth standards data"""
    from app.utils.who_growth_standards import get_who_weight_reference, get_who_height_reference
    weight_ref = get_who_weight_reference(33, "male")
    assert "median" in weight_ref
    assert "sd" in weight_ref
    height_ref = get_who_height_reference(33, "female")
    assert "median" in height_ref
    assert "sd" in height_ref


def test_fies_calculator_service():
    """Test FIES calculator service"""
    from app.services.fies_calculator import FIESCalculator
    responses = {"q1": 1, "q2": 1, "q3": 0, "q4": 0, "q5": 0, "q6": 0, "q7": 0, "q8": 0}
    score = FIESCalculator.calculate_score(responses)
    assert score == 2
    classification = FIESCalculator.classify_score(score)
    assert classification == "food_secure"
    recs = FIESCalculator.get_recommendations(classification)
    assert len(recs) > 0


def test_recommendation_engine_structure():
    """Test recommendation engine returns valid structure"""
    from app.services.recommendation_engine import RecommendationEngine
    from unittest.mock import MagicMock
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    result = RecommendationEngine.generate(mock_db, "test-beneficiary")
    assert "beneficiary_id" in result
    assert "recommendations" in result
    assert "generated_at" in result
    assert "next_review_date" in result
    assert len(result["recommendations"]) > 0


def test_dashboard_metrics_handles_real_voucher_joins():
    """Dashboard metrics should work for successful donations with allocated vouchers."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        donor_id = uuid4()
        beneficiary_id = uuid4()

        db.add(UserProfile(user_id=donor_id, full_name="Donor"))
        db.add(DonorProfile(user_id=donor_id, total_donated=0, children_sponsored=0, subscription_status="inactive"))
        db.add(UserProfile(user_id=beneficiary_id, full_name="Penerima"))
        db.add(BeneficiaryProfile(user_id=beneficiary_id, family_size=1, vouchers_balance=0, approval_status="approved"))
        db.flush()

        db.add(
            Subscription(
                donor_id=donor_id,
                plan_name="Paket Bulanan",
                amount=Decimal("50000"),
                frequency="monthly",
                status=SubscriptionStatusEnum.active,
                payment_method="qris",
                next_billing_date=date.today(),
            )
        )

        donation = Donation(
            donor_id=donor_id,
            amount=Decimal("100000"),
            type=DonationTypeEnum.one_time,
            payment_method="qris",
            status=DonationStatusEnum.success,
        )
        db.add(donation)
        db.flush()

        db.add(
            Voucher(
                code="VCR-001",
                beneficiary_id=beneficiary_id,
                donation_id=donation.id,
                balance=Decimal("100000"),
                allocated_date=datetime.utcnow(),
                expiry_date=date.today(),
                status=VoucherStatusEnum.active,
            )
        )
        db.commit()

        metrics = DonationService.get_dashboard_metrics(db, str(donor_id))

        assert metrics["total_donated"] == Decimal("100000")
        assert metrics["active_subscriptions"] == 1
        assert metrics["children_helped"] == 1
        assert metrics["conversion_rate"] == 100.0
        assert metrics["monthly_stats"]["vouchers_redeemed"] == 1
        assert metrics["monthly_stats"]["children_received_nutrition"] == 1
    finally:
        db.close()
