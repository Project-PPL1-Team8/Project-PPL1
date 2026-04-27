"""
Donation Service
Business logic for donation management
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from decimal import Decimal
import logging
from uuid import UUID

from app.models.donation import Donation, DonationStatusEnum, Voucher
from app.schemas.donation import DonationCreate, DonationQueryParams

logger = logging.getLogger(__name__)


class DonationService:
    """Service for donation operations"""

    @staticmethod
    def _to_uuid(value: Optional[str | UUID]) -> Optional[UUID]:
        """Normalize incoming ID values to UUID for UUID-backed columns."""
        if value is None:
            return None
        if isinstance(value, UUID):
            return value
        return UUID(str(value))
    
    @staticmethod
    def create_donation(
        db: Session,
        donor_id: str,
        donation_data: DonationCreate
    ) -> Donation:
        """Create new donation"""
        donor_uuid = DonationService._to_uuid(donor_id)
        recipient_uuid = DonationService._to_uuid(donation_data.recipient_id)

        donation = Donation(
            donor_id=donor_uuid,
            recipient_id=recipient_uuid,
            amount=donation_data.amount,
            type=donation_data.type,
            payment_method=donation_data.payment_method,
            status=DonationStatusEnum.pending,
            subscription_config=donation_data.subscription_config
        )
        
        db.add(donation)
        db.commit()
        db.refresh(donation)
        
        logger.info(f"Created donation {donation.id} for donor {donor_uuid}")
        
        return donation
    
    @staticmethod
    def get_donation_by_id(
        db: Session,
        donation_id: str,
        donor_id: Optional[str] = None
    ) -> Optional[Donation]:
        """Get donation by ID"""
        donation_uuid = DonationService._to_uuid(donation_id)
        query = db.query(Donation).filter(Donation.id == donation_uuid)
        
        if donor_id:
            donor_uuid = DonationService._to_uuid(donor_id)
            query = query.filter(Donation.donor_id == donor_uuid)
        
        return query.first()
    
    @staticmethod
    def get_donations(
        db: Session,
        donor_id: Optional[str] = None,
        params: DonationQueryParams = None
    ) -> List[Donation]:
        """Get donations with filtering and pagination"""
        query = db.query(Donation)
        
        if donor_id:
            donor_uuid = DonationService._to_uuid(donor_id)
            query = query.filter(Donation.donor_id == donor_uuid)
        
        if params:
            if params.status:
                query = query.filter(Donation.status == params.status)
            if params.type:
                query = query.filter(Donation.type == params.type)
            if params.start_date:
                query = query.filter(Donation.created_at >= params.start_date)
            if params.end_date:
                query = query.filter(Donation.created_at <= params.end_date)
        
        query = query.order_by(Donation.created_at.desc())
        
        if params:
            offset = (params.page - 1) * params.page_size
            query = query.offset(offset).limit(params.page_size)
        
        return query.all()
    
    @staticmethod
    def get_donations_count(
        db: Session,
        donor_id: Optional[str] = None,
        params: DonationQueryParams = None
    ) -> int:
        """Get total count of donations with filters"""
        query = db.query(func.count(Donation.id))
        
        if donor_id:
            donor_uuid = DonationService._to_uuid(donor_id)
            query = query.filter(Donation.donor_id == donor_uuid)
        
        if params:
            if params.status:
                query = query.filter(Donation.status == params.status)
            if params.type:
                query = query.filter(Donation.type == params.type)
            if params.start_date:
                query = query.filter(Donation.created_at >= params.start_date)
            if params.end_date:
                query = query.filter(Donation.created_at <= params.end_date)
        
        return query.scalar()
    
    @staticmethod
    def update_donation_status(
        db: Session,
        donation_id: str,
        status: DonationStatusEnum,
        midtrans_transaction_id: Optional[str] = None
    ) -> Optional[Donation]:
        """Update donation status"""
        donation_uuid = DonationService._to_uuid(donation_id)
        donation = db.query(Donation).filter(Donation.id == donation_uuid).first()
        
        if not donation:
            return None
        
        donation.status = status
        
        if midtrans_transaction_id:
            donation.midtrans_transaction_id = midtrans_transaction_id
        
        db.commit()
        db.refresh(donation)
        
        logger.info(f"Updated donation {donation_id} status to {status.value}")
        
        return donation
    
    @staticmethod
    def get_impact_metrics(
        db: Session,
        donor_id: str
    ) -> dict:
        """Get impact metrics for donor"""
        donor_uuid = DonationService._to_uuid(donor_id)

        total_donated = db.query(func.sum(Donation.amount)).filter(
            Donation.donor_id == donor_uuid,
            Donation.status == DonationStatusEnum.success
        ).scalar() or Decimal(0)
        
        children_helped = db.query(func.count(func.distinct(Voucher.beneficiary_id))).join(
            Donation,
            Voucher.donation_id == Donation.id
        ).filter(
            Donation.donor_id == donor_uuid
        ).scalar() or 0
        
        vouchers_allocated = db.query(func.count(Voucher.id)).join(
            Donation,
            Voucher.donation_id == Donation.id
        ).filter(
            Donation.donor_id == donor_uuid
        ).scalar() or 0
        
        return {
            "donor_id": str(donor_uuid),
            "total_donated": total_donated,
            "total_children_helped": children_helped,
            "total_vouchers_allocated": vouchers_allocated,
            "donation_trend": [],
            "geographic_distribution": []
        }

    @staticmethod
    def get_dashboard_metrics(
        db: Session,
        donor_id: str
    ) -> dict:
        """Get dashboard metrics for donor - for dashboard display"""
        
        donor_uuid = DonationService._to_uuid(donor_id)

        # Total donated (all success donations)
        total_donated = db.query(func.sum(Donation.amount)).filter(
            Donation.donor_id == donor_uuid,
            Donation.status == DonationStatusEnum.success
        ).scalar() or Decimal(0)
        
        # Active subscriptions (from Subscription model, not Donation)
        from app.models.subscription import Subscription, SubscriptionStatusEnum
        active_subscriptions = db.query(func.count(Subscription.id)).filter(
            Subscription.donor_id == donor_uuid,
            Subscription.status == SubscriptionStatusEnum.active
        ).scalar() or 0
        
        # Children helped (unique recipients)
        children_helped = db.query(func.count(func.distinct(Voucher.beneficiary_id))).join(
            Donation,
            Voucher.donation_id == Donation.id
        ).filter(
            Donation.donor_id == donor_uuid,
            Donation.status == DonationStatusEnum.success
        ).scalar() or 0
        
        # Conversion rate
        total_donations = db.query(func.count(Donation.id)).filter(
            Donation.donor_id == donor_uuid
        ).scalar() or 0
        successful_donations = db.query(func.count(Donation.id)).filter(
            Donation.donor_id == donor_uuid,
            Donation.status == DonationStatusEnum.success
        ).scalar() or 0
        
        conversion_rate = (successful_donations / total_donations * 100) if total_donations > 0 else 0
        
        # ============================================
        # REAL MONTHLY STATS (not mocked)
        # ============================================
        from datetime import date
        from app.models.donation import Voucher
        
        today = date.today()
        start_of_month = today.replace(day=1)
        
        # Vouchers redeemed this month (vouchers created this month)
        vouchers_redeemed = db.query(func.count(Voucher.id)).join(
            Donation
        ).filter(
            Donation.donor_id == donor_uuid,
            Donation.status == DonationStatusEnum.success,
            Voucher.allocated_date >= start_of_month
        ).scalar() or 0
        
        # Children who received nutrition (unique recipients with vouchers this month)
        children_received_nutrition = db.query(func.count(func.distinct(Voucher.beneficiary_id))).join(
            Donation,
            Voucher.donation_id == Donation.id
        ).filter(
            Donation.donor_id == donor_uuid,
            Donation.status == DonationStatusEnum.success,
            Voucher.allocated_date >= start_of_month
        ).scalar() or 0
        
        # Nutrition score improvement (compare FIES scores before/after)
        # This is a simplified calculation - in production would need more sophisticated tracking
        nutrition_score_improvement = 0.0  # Placeholder - requires FIES tracking system
        
        # Top category redeemed (from voucher transactions)
        # This would require Order/Product data - placeholder for now
        top_category = "Pangan Umum"  # Placeholder until Order system is implemented
        
        return {
            "total_donated": total_donated,
            "active_subscriptions": active_subscriptions,
            "children_helped": children_helped,
            "conversion_rate": round(conversion_rate, 1),
            "monthly_stats": {
                "vouchers_redeemed": vouchers_redeemed,  # ← REAL DATA
                "children_received_nutrition": children_received_nutrition,  # ← REAL DATA
                "nutrition_score_improvement": nutrition_score_improvement,
                "top_category": top_category
            }
        }
