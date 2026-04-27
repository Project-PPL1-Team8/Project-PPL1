from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine, get_db
from app.main import app
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.models.donation import Donation, DonationStatusEnum, DonationTypeEnum, Voucher, VoucherStatusEnum
from app.models.nutrition import FIESSurvey
from app.models.product import Category, Order, Product
from app.models.user import BeneficiaryProfile, DonorProfile, UserProfile, VendorProfile


ADMIN_USER_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


@pytest.fixture(scope="function")
def admin_client():
    def override_auth():
        return AuthenticatedUser(
            user_id=ADMIN_USER_ID,
            email="admin@seribuasa.id",
            role="admin",
            email_verified=True,
        )

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_current_user] = override_auth
    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        yield client

    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def seeded_admin_data():
    db = SessionLocal()
    try:
        today = date.today()
        now = datetime.utcnow()

        admin_user = UserProfile(user_id=ADMIN_USER_ID, full_name="Platform Admin")
        donor_user_id = uuid4()
        donor_user = UserProfile(user_id=donor_user_id, full_name="Donatur Baik")
        donor_profile = DonorProfile(
            user_id=donor_user_id,
            total_donated=Decimal("0"),
            children_sponsored=0,
            subscription_status="inactive",
        )

        approved_beneficiary_user_id = uuid4()
        approved_beneficiary_user = UserProfile(
            user_id=approved_beneficiary_user_id,
            full_name="Penerima Aktif",
        )
        approved_beneficiary = BeneficiaryProfile(
            user_id=approved_beneficiary_user_id,
            family_size=3,
            vouchers_balance=Decimal("125000"),
            approval_status="approved",
        )

        pending_beneficiary_user_id = uuid4()
        pending_beneficiary_user = UserProfile(
            user_id=pending_beneficiary_user_id,
            full_name="Penerima Pending",
        )
        pending_beneficiary = BeneficiaryProfile(
            user_id=pending_beneficiary_user_id,
            family_size=4,
            vouchers_balance=Decimal("0"),
            approval_status="pending",
        )

        pending_vendor_user_id = uuid4()
        pending_vendor_user = UserProfile(user_id=pending_vendor_user_id, full_name="Vendor Pending")
        pending_vendor = VendorProfile(
            user_id=pending_vendor_user_id,
            store_name="Warung Pending",
            store_address="Jl. Pending",
            approval_status="pending",
        )

        approved_vendor_user_id = uuid4()
        approved_vendor_user = UserProfile(user_id=approved_vendor_user_id, full_name="Vendor Siap")
        approved_vendor = VendorProfile(
            user_id=approved_vendor_user_id,
            store_name="Warung Siap",
            store_address="Jl. Siap",
            approval_status="approved",
        )

        category = Category(name="Pangan", slug="pangan")

        db.add_all(
            [
                admin_user,
                donor_user,
                donor_profile,
                approved_beneficiary_user,
                approved_beneficiary,
                pending_beneficiary_user,
                pending_beneficiary,
                pending_vendor_user,
                pending_vendor,
                approved_vendor_user,
                approved_vendor,
                category,
            ]
        )
        db.flush()

        current_month_survey = FIESSurvey(
            beneficiary_id=approved_beneficiary_user_id,
            responses={"q1": "yes", "q2": "yes", "q3": "yes", "q4": "no", "q5": "no", "q6": "no", "q7": "no", "q8": "no"},
            score=3,
            classification="moderate",
            survey_date=now,
            survey_month=today.month,
            survey_year=today.year,
        )
        old_survey = FIESSurvey(
            beneficiary_id=pending_beneficiary_user_id,
            responses={"q1": "no", "q2": "no", "q3": "no", "q4": "no", "q5": "no", "q6": "no", "q7": "no", "q8": "no"},
            score=0,
            classification="food_secure",
            survey_date=datetime(today.year, max(1, today.month - 1), 1),
            survey_month=max(1, today.month - 1),
            survey_year=today.year,
        )
        db.add_all([current_month_survey, old_survey])
        db.flush()

        approved_product = Product(
            vendor_id=approved_vendor_user_id,
            category_id=category.id,
            name="Beras Premium",
            description="Siap kirim",
            price=Decimal("70000"),
            voucher_price=Decimal("65000"),
            stock_quantity=20,
            unit="kg",
            approval_status="approved",
        )
        pending_product = Product(
            vendor_id=pending_vendor_user_id,
            category_id=category.id,
            name="Telur Segar",
            description="Menunggu review",
            price=Decimal("30000"),
            voucher_price=Decimal("28000"),
            stock_quantity=15,
            unit="tray",
            approval_status="pending",
        )
        db.add_all([approved_product, pending_product])
        db.flush()

        success_donation = Donation(
            donor_id=donor_user_id,
            amount=Decimal("150000"),
            type=DonationTypeEnum.one_time,
            payment_method="qris",
            status=DonationStatusEnum.success,
            midtrans_transaction_id="ALLOC-TEST-1",
        )
        pending_donation = Donation(
            donor_id=donor_user_id,
            amount=Decimal("90000"),
            type=DonationTypeEnum.one_time,
            payment_method="bank_transfer",
            status=DonationStatusEnum.pending,
        )
        db.add_all([success_donation, pending_donation])
        db.flush()

        voucher = Voucher(
            code="VCR-ADMIN-1",
            beneficiary_id=approved_beneficiary_user_id,
            donation_id=success_donation.id,
            balance=Decimal("150000"),
            allocated_date=now,
            expiry_date=today,
            status=VoucherStatusEnum.active,
        )
        db.add(voucher)

        order = Order(
            beneficiary_id=approved_beneficiary_user_id,
            vendor_id=approved_vendor_user_id,
            total_amount=Decimal("50000"),
            voucher_used=Decimal("50000"),
            cash_paid=Decimal("0"),
            status="completed",
            payment_status="paid",
        )
        db.add(order)

        db.commit()

        return {
            "pending_beneficiary_user_id": pending_beneficiary_user_id,
            "pending_vendor_user_id": pending_vendor_user_id,
            "pending_product_id": pending_product.id,
            "approved_beneficiary_user_id": approved_beneficiary_user_id,
            "donor_user_id": donor_user_id,
        }
    finally:
        db.close()


def test_admin_stats_include_pending_approval_counts(admin_client: TestClient, seeded_admin_data):
    response = admin_client.get("/api/v1/admin/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["users"]["pending_beneficiaries"] == 1
    assert data["users"]["pending_vendors"] == 1
    assert data["products"]["pending"] == 1
    assert data["donations"]["pending_count"] == 1
    assert data["donations"]["unallocated_success_count"] == 0


def test_admin_can_list_and_approve_pending_beneficiary(admin_client: TestClient, seeded_admin_data):
    pending_beneficiary_user_id = str(seeded_admin_data["pending_beneficiary_user_id"])

    list_response = admin_client.get("/api/v1/admin/users/approvals", params={"role": "beneficiary", "status": "pending"})
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert any(item["user_id"] == pending_beneficiary_user_id for item in items)

    approve_response = admin_client.patch(
        f"/api/v1/admin/users/{pending_beneficiary_user_id}/approval",
        json={"approval_status": "approved", "notes": "Dokumen lengkap"},
    )
    assert approve_response.status_code == 200
    approved_item = approve_response.json()
    assert approved_item["approval_status"] == "approved"
    assert approved_item["role"] == "beneficiary"


def test_admin_can_review_and_approve_pending_product(admin_client: TestClient, seeded_admin_data):
    pending_product_id = str(seeded_admin_data["pending_product_id"])

    list_response = admin_client.get("/api/v1/admin/products/reviews", params={"status": "pending"})
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert any(item["id"] == pending_product_id for item in items)

    approve_response = admin_client.patch(
        f"/api/v1/admin/products/{pending_product_id}/approval",
        json={"approval_status": "approved"},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["approval_status"] == "approved"


def test_admin_can_monitor_donations_and_beneficiary_eligibility(admin_client: TestClient, seeded_admin_data):
    donation_response = admin_client.get("/api/v1/admin/donations")
    assert donation_response.status_code == 200
    donation_items = donation_response.json()["items"]
    assert any(item["allocation_status"] == "allocated" for item in donation_items)
    assert any(item["allocation_status"] == "pending_payment" for item in donation_items)

    eligibility_response = admin_client.get("/api/v1/admin/beneficiaries/eligibility", params={"eligible_only": "true"})
    assert eligibility_response.status_code == 200
    items = eligibility_response.json()["items"]
    assert len(items) == 1
    assert items[0]["user_id"] == str(seeded_admin_data["approved_beneficiary_user_id"])
    assert items[0]["eligible_for_allocation"] is True
