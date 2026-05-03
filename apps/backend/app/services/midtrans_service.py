import midtransclient
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.donation import Donation, DonationStatusEnum, Voucher, VoucherStatusEnum
from app.models.user import BeneficiaryProfile, DonorProfile
from app.models.nutrition import FIESSurvey
from app.config import settings
from datetime import datetime, timedelta
from decimal import Decimal
import uuid
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

class MidtransService:
    @staticmethod
    def get_snap_client():
        return midtransclient.Snap(
            is_production=settings.MIDTRANS_IS_PRODUCTION,
            server_key=settings.MIDTRANS_SERVER_KEY,
            client_key=settings.MIDTRANS_CLIENT_KEY
        )
        
    @staticmethod
    def get_core_api_client():
        return midtransclient.CoreApi(
            is_production=settings.MIDTRANS_IS_PRODUCTION,
            server_key=settings.MIDTRANS_SERVER_KEY,
            client_key=settings.MIDTRANS_CLIENT_KEY
        )

    @staticmethod
    def create_transaction(donation: Donation, donor_email: str, donor_name: str) -> dict:
        """
        Create a Snap transaction for a given donation.
        Returns the Snap Token and Redirect URL.
        """
        if not settings.MIDTRANS_SERVER_KEY:
            logger.error("Midtrans Server Key is not set. Cannot create Midtrans transaction.")
            raise ValueError("MIDTRANS_SERVER_KEY is not configured. Please set it in your .env file.")

        snap = MidtransService.get_snap_client()
        param = {
            "transaction_details": {
                "order_id": f"DONATION-{donation.id}",
                "gross_amount": int(donation.amount)
            },
            "customer_details": {
                "first_name": donor_name,
                "email": donor_email
            }
        }
        logger.info(f"Creating Midtrans transaction for donation {donation.id} with amount {donation.amount}")
        transaction = snap.create_transaction(param)
        return transaction

    @staticmethod
    def process_payment_success(
        db: Session,
        donation_id: str,
        midtrans_transaction_id: str = None
    ) -> dict:
        logger.info(f"Starting Midtrans payment processing for donation {donation_id}")

        from app.services.donation_allocation_service import DonationAllocationService

        try:
            result = DonationAllocationService.process_successful_donation(
                db=db,
                donation_id=donation_id,
                transaction_id=midtrans_transaction_id,
            )
            logger.info(f"Midtrans payment processed successfully for donation {donation_id}")
            return result
        except Exception as e:
            logger.error(f"Error processing Midtrans payment for donation {donation_id}: {str(e)}")
            raise
    
    @staticmethod
    def _create_voucher(db: Session, donation: Donation) -> Voucher:
        logger.info(f"Creating voucher for donation {donation.id}, recipient: {donation.recipient_id}")
        
        if not donation.recipient_id:
            logger.warning(f"No recipient assigned for donation {donation.id}, skipping voucher creation")
            raise ValueError("Cannot create voucher: no recipient assigned to donation")
        
        voucher_code = f"VCH-{datetime.utcnow().year}-{uuid.uuid4().hex[:6].upper()}"
        expiry_date = datetime.utcnow().date() + timedelta(days=30)
        
        try:
            voucher = Voucher(
                code=voucher_code,
                beneficiary_id=donation.recipient_id,
                donation_id=donation.id,
                balance=donation.amount,
                allocated_date=datetime.utcnow(),
                expiry_date=expiry_date,
                status=VoucherStatusEnum.active
            )
            
            db.add(voucher)
            logger.info(f"Voucher {voucher_code} added to session")
            
            beneficiary = db.query(BeneficiaryProfile).filter(
                BeneficiaryProfile.user_id == donation.recipient_id
            ).first()
            
            if beneficiary:
                current_balance = beneficiary.vouchers_balance or Decimal(0)
                beneficiary.vouchers_balance = current_balance + Decimal(str(donation.amount))
                logger.info(f"Updated beneficiary {beneficiary.user_id} balance: {current_balance} -> {beneficiary.vouchers_balance}")
            else:
                logger.warning(f"Beneficiary {donation.recipient_id} not found when updating balance")
            
            return voucher
        except Exception as e:
            logger.error(f"Error creating voucher: {str(e)}")
            raise
    
    @staticmethod
    def _update_donor_metrics(db: Session, donor_id: str, amount: Decimal):
        try:
            logger.info(f"Updating donor metrics for donor {donor_id}, amount: {amount}")
            donor_uuid = UUID(str(donor_id)) if not isinstance(donor_id, UUID) else donor_id
            donor = db.query(DonorProfile).filter(
                DonorProfile.user_id == donor_uuid
            ).first()
            
            if donor:
                current_total = donor.total_donated or Decimal(0)
                donor.total_donated = current_total + Decimal(str(amount))
                logger.info(f"Updated donor {donor_id} total_donated: {current_total} -> {donor.total_donated}")
            else:
                logger.warning(f"Donor profile not found for user {donor_id}")
        except Exception as e:
            logger.error(f"Error updating donor metrics: {str(e)}")
            raise
    
    @staticmethod
    def _find_best_beneficiary(db: Session) -> str | None:
        logger.info("Finding best beneficiary for auto-allocation...")
        
        try:
            beneficiaries = db.query(
                BeneficiaryProfile,
                func.coalesce(FIESSurvey.score, 0).label('fies_score'),
                func.coalesce(BeneficiaryProfile.vouchers_balance, Decimal(0)).label('voucher_balance')
            ).outerjoin(
                FIESSurvey,
                FIESSurvey.beneficiary_id == BeneficiaryProfile.user_id
            ).filter(
                BeneficiaryProfile.approval_status == "approved"
            ).order_by(
                FIESSurvey.score.desc().nullslast(),
                BeneficiaryProfile.vouchers_balance.asc()
            ).all()
            
            logger.info(f"Found {len(beneficiaries)} approved beneficiaries")
        except Exception as e:
            logger.error(f"Error querying beneficiaries: {str(e)}")
            return None
        
        if not beneficiaries:
            logger.warning("No approved beneficiaries found for auto-allocation")
            return None
        
        try:
            best_candidate = beneficiaries[0][0]
            beneficiary_id = str(best_candidate.user_id)
            fies_score = beneficiaries[0][1] if beneficiaries[0][1] else 0
            voucher_balance = beneficiaries[0][2] if beneficiaries[0][2] else Decimal(0)
            
            if fies_score >= 6:
                priority_level = "SEVERE (Prioritas Tinggi)"
            elif fies_score >= 3:
                priority_level = "MODERATE"
            else:
                priority_level = "Food Secure"
                
            logger.info(
                f"Auto-allocation: Selected beneficiary {beneficiary_id} "
                f"(FIES Score: {fies_score}, {priority_level}, "
                f"Current Balance: Rp {voucher_balance})"
            )
            
            return beneficiary_id
        except Exception as e:
            logger.error(f"Error processing beneficiary selection: {str(e)}")
            return None
    
    @staticmethod
    def _calculate_impact(donation: Donation) -> dict:
        try:
            amount = float(donation.amount) if donation.amount else 0
            units = int(amount // 500000)
            children_helped = units if donation.recipient_id else 0
            days_of_support = units * 1000
            
            if donation.subscription_config:
                months_of_support = donation.subscription_config.get("duration_months", 1)
            else:
                months_of_support = 1
            
            message = "Terima kasih atas kontribusi Anda!"
            if children_helped > 0:
                day_text = "1000 hari pertama kehidupan" if days_of_support == 1000 else f"{days_of_support} hari pertama kehidupan"
                message = f"Donasi Anda akan membantu {children_helped} anak dan mendukung nutrisi {day_text} (1000 HPK)."
            
            return {
                "children_helped": children_helped,
                "months_of_support": months_of_support,
                "days_of_support": days_of_support,
                "message": message
            }
        except Exception as e:
            logger.error(f"Error calculating impact: {str(e)}")
            return {
                "children_helped": 0,
                "months_of_support": 1,
                "days_of_support": 0,
                "message": "Terima kasih atas kontribusi Anda!"
            }

    @staticmethod
    def handle_notification(db: Session, notification_dict: dict):
        """
        Handle Midtrans webhook notification.
        """
        if not settings.MIDTRANS_SERVER_KEY:
            logger.warning("Midtrans Server Key is not set. Skipping notification handle.")
            return {"status": "ignored"}

        core_api = MidtransService.get_core_api_client()
        
        try:
            status_response = core_api.transactions.notification(notification_dict)
        except Exception as e:
            logger.error(f"Failed to verify notification: {str(e)}")
            raise e

        order_id = status_response['order_id']
        transaction_status = status_response['transaction_status']
        fraud_status = status_response.get('fraud_status')
        transaction_id = status_response.get('transaction_id')
        
        if not order_id.startswith("DONATION-"):
            return {"status": "ignored", "message": "Not a donation order"}
            
        donation_id = order_id.replace("DONATION-", "")
        
        from app.services.donation_service import DonationService
        
        logger.info(f"Midtrans notification: order {order_id}, status {transaction_status}, fraud {fraud_status}")
        
        if transaction_status == 'capture':
            if fraud_status == 'challenge':
                pass
            elif fraud_status == 'accept':
                MidtransService.process_payment_success(db, donation_id, transaction_id)
        elif transaction_status == 'settlement':
            MidtransService.process_payment_success(db, donation_id, transaction_id)
        elif transaction_status in ['cancel', 'deny', 'expire']:
            DonationService.update_donation_status(db, donation_id, DonationStatusEnum.failed, transaction_id)
        elif transaction_status == 'pending':
            pass
            
        return {"status": "ok"}
