"""
Subscription Service
Business logic for subscription management
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta, datetime
from decimal import Decimal
from uuid import UUID
from typing import List, Optional, Dict, Any
import logging

from app.models.subscription import (
    Subscription, SubscriptionPlan, BillingHistory,
    SubscriptionStatusEnum, BillingStatusEnum
)
from app.models.donation import Donation, DonationTypeEnum, DonationStatusEnum


logger = logging.getLogger(__name__)


class SubscriptionService:
    """Service for subscription operations"""
    
    @staticmethod
    def create_from_donation(
        db: Session,
        donation: Donation,
        plan_id: Optional[str] = None
    ) -> Subscription:
        """
        Create subscription record after successful donation
        
        This links a one-time donation to a recurring subscription
        """
        logger.info(f"[SUBSCRIPTION] Creating subscription from donation {donation.id}")
        
        # Get plan details if plan_id provided
        plan = None
        if plan_id:
            # Try to find by name/keyword first (frontend sends plan name/slug)
            plan = db.query(SubscriptionPlan).filter(
                SubscriptionPlan.name.ilike(f"%{plan_id}%"),
                SubscriptionPlan.is_active == "true"
            ).first()
            
            # If not found, try by UUID
            if not plan:
                try:
                    plan_uuid = UUID(plan_id)
                    plan = db.query(SubscriptionPlan).filter(
                        SubscriptionPlan.id == plan_uuid,
                        SubscriptionPlan.is_active == "true"
                    ).first()
                except ValueError:
                    logger.warning(f"[SUBSCRIPTION] Invalid plan_id format: {plan_id}")
        
        # Create subscription
        subscription = Subscription(
            donor_id=donation.donor_id,
            plan_id=plan.id if plan else None,
            plan_name=plan.name if plan else "Custom Subscription",
            amount=donation.amount,
            currency="IDR",
            frequency="monthly",
            status=SubscriptionStatusEnum.active,
            payment_method=donation.payment_method,
            next_billing_date=date.today() + timedelta(days=30),
            started_at=datetime.utcnow(),
            meta_data={
                "source_donation_id": str(donation.id),
                "plan_reference": plan_id,
                "auto_created": True
            }
        )
        
        db.add(subscription)
        db.flush()  # Get subscription.id without committing
        
        # Create billing history for first payment
        billing = BillingHistory(
            subscription_id=subscription.id,
            amount=donation.amount,
            currency="IDR",
            status=BillingStatusEnum.success,
            payment_method=donation.payment_method,
            transaction_id=donation.midtrans_transaction_id,
            billing_date=date.today()
        )
        db.add(billing)
        
        # Link donation to subscription
        donation.subscription_id = subscription.id
        
        db.commit()
        db.refresh(subscription)
        
        logger.info(f"[SUBSCRIPTION] Created subscription {subscription.id} for donor {donation.donor_id}")
        return subscription
    
    @staticmethod
    def get_subscription_by_donation(
        db: Session,
        donation_id: str
    ) -> Optional[Subscription]:
        """Get subscription associated with a donation"""
        return db.query(Subscription).join(Donation).filter(
            Donation.id == donation_id
        ).first()
    
    @staticmethod
    def get_donor_subscriptions(
        db: Session,
        donor_id: str,
        status: Optional[str] = None
    ) -> List[Subscription]:
        """Get all subscriptions for a donor"""
        donor_uuid = UUID(str(donor_id)) if not isinstance(donor_id, UUID) else donor_id
        
        query = db.query(Subscription).filter(Subscription.donor_id == donor_uuid)
        
        if status:
            query = query.filter(Subscription.status == status)
        
        return query.order_by(Subscription.created_at.desc()).all()
    
    @staticmethod
    def get_active_subscriptions(db: Session) -> List[Subscription]:
        """Get all active subscriptions"""
        return db.query(Subscription).filter(
            Subscription.status == SubscriptionStatusEnum.active
        ).all()
    
    @staticmethod
    def get_due_subscriptions(db: Session) -> List[Subscription]:
        """Get all active subscriptions due for billing"""
        today = date.today()
        
        return db.query(Subscription).filter(
            Subscription.next_billing_date <= today,
            Subscription.status == SubscriptionStatusEnum.active
        ).all()
    
    @staticmethod
    def process_billing(db: Session, subscription: Subscription) -> Dict[str, Any]:
        """
        Process billing for a subscription
        
        Creates a new donation and processes payment
        """
        from app.services.midtrans_service import MidtransService
        from app.services.donation_allocation_service import DonationAllocationService
        from app.services.midtrans_service import MidtransService
        
        logger.info(f"[BILLING] Processing billing for subscription {subscription.id}")
        
        try:
            # Create new donation for this billing
            donation = Donation(
                donor_id=subscription.donor_id,
                amount=subscription.amount,
                type=DonationTypeEnum.subscription,
                payment_method=subscription.payment_method,
                status=DonationStatusEnum.pending,
                subscription_config={
                    "subscription_id": str(subscription.id),
                    "billing_cycle": len(subscription.billing_history) + 1,
                    "auto_billing": True
                }
            )
            db.add(donation)
            db.flush()  # Get ID without committing
            
            # Process payment via Midtrans
            result = MidtransService.process_payment_success(
            # Process payment
            result = DonationAllocationService.process_successful_donation(
                db=db,
                donation_id=str(donation.id)
            )
            # Process payment via Midtrans
            result = MidtransService.process_payment_success(
                db=db,
                donation_id=str(donation.id)
            )
            
            if result.get("success"):
                # Create billing history
                billing = BillingHistory(
                    subscription_id=subscription.id,
                    amount=subscription.amount,
                    status=BillingStatusEnum.success,
                    payment_method=subscription.payment_method,
                    transaction_id=result.get("transaction_id"),
                    billing_date=date.today()
                )
                db.add(billing)
                
                # Update subscription next billing date
                subscription.next_billing_date = date.today() + timedelta(days=30)
                
                db.commit()
                
                logger.info(f"[BILLING] Successfully processed subscription {subscription.id}")
                return {
                    "success": True,
                    "donation_id": str(donation.id),
                    "transaction_id": result.get("transaction_id")
                }
            else:
                # Payment failed
                billing = BillingHistory(
                    subscription_id=subscription.id,
                    amount=subscription.amount,
                    status=BillingStatusEnum.failed,
                    payment_method=subscription.payment_method,
                    billing_date=date.today()
                )
                db.add(billing)
                db.commit()
                
                logger.warning(f"[BILLING] Payment failed for subscription {subscription.id}")
                return {
                    "success": False,
                    "error": "Payment processing failed"
                }
                
        except Exception as e:
            db.rollback()
            logger.error(f"[BILLING] Error processing billing: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def pause_subscription(db: Session, subscription_id: str) -> bool:
        """Pause a subscription"""
        try:
            sub_uuid = UUID(str(subscription_id))
            subscription = db.query(Subscription).filter(
                Subscription.id == sub_uuid
            ).first()
            
            if not subscription or not subscription.can_pause():
                return False
            
            subscription.status = SubscriptionStatusEnum.paused
            subscription.paused_at = datetime.utcnow()
            db.commit()
            
            logger.info(f"[SUBSCRIPTION] Paused subscription {subscription_id}")
            return True
            
        except Exception as e:
            logger.error(f"[SUBSCRIPTION] Error pausing subscription: {e}")
            return False
    
    @staticmethod
    def resume_subscription(db: Session, subscription_id: str) -> bool:
        """Resume a paused subscription"""
        try:
            sub_uuid = UUID(str(subscription_id))
            subscription = db.query(Subscription).filter(
                Subscription.id == sub_uuid
            ).first()
            
            if not subscription or not subscription.can_resume():
                return False
            
            subscription.status = SubscriptionStatusEnum.active
            subscription.paused_at = None
            # Reset next billing date to 30 days from now
            subscription.next_billing_date = date.today() + timedelta(days=30)
            db.commit()
            
            logger.info(f"[SUBSCRIPTION] Resumed subscription {subscription_id}")
            return True
            
        except Exception as e:
            logger.error(f"[SUBSCRIPTION] Error resuming subscription: {e}")
            return False
    
    @staticmethod
    def cancel_subscription(db: Session, subscription_id: str) -> bool:
        """Cancel a subscription"""
        try:
            sub_uuid = UUID(str(subscription_id))
            subscription = db.query(Subscription).filter(
                Subscription.id == sub_uuid
            ).first()
            
            if not subscription or not subscription.can_cancel():
                return False
            
            subscription.status = SubscriptionStatusEnum.cancelled
            subscription.cancelled_at = datetime.utcnow()
            db.commit()
            
            logger.info(f"[SUBSCRIPTION] Cancelled subscription {subscription_id}")
            return True
            
        except Exception as e:
            logger.error(f"[SUBSCRIPTION] Error cancelling subscription: {e}")
            return False
    
    @staticmethod
    def get_subscription_metrics(db: Session, donor_id: str) -> Dict[str, Any]:
        """Get subscription metrics for a donor"""
        donor_uuid = UUID(str(donor_id)) if not isinstance(donor_id, UUID) else donor_id
        
        # Active subscriptions count
        active_count = db.query(func.count(Subscription.id)).filter(
            Subscription.donor_id == donor_uuid,
            Subscription.status == SubscriptionStatusEnum.active
        ).scalar() or 0
        
        # Total amount donated through subscriptions
        total_subscription_amount = db.query(func.sum(Subscription.amount)).filter(
            Subscription.donor_id == donor_uuid,
            Subscription.status.in_([SubscriptionStatusEnum.active, SubscriptionStatusEnum.paused])
        ).scalar() or Decimal(0)
        
        # Total billing history count
        billing_count = db.query(func.count(BillingHistory.id)).join(Subscription).filter(
            Subscription.donor_id == donor_uuid,
            BillingHistory.status == BillingStatusEnum.success
        ).scalar() or 0
        
        return {
            "active_subscriptions": active_count,
            "total_subscription_amount": float(total_subscription_amount),
            "total_payments": billing_count
        }
