"""
Donation Router
Handles donation creation, listing, and management
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.database import get_db
from app.services.donation_service import DonationService
from app.middleware.auth import get_current_user, AuthenticatedUser
from app.schemas.donation import (
    DonationCreate,
    DonationResponse,
    DonationWithImpact,
    DonationListResponse,
    ImpactMetrics,
    DonationQueryParams,
    DonationTypeEnum,
    DonationStatusEnum,
    DashboardMetrics,
    PaymentResponse
)
from app.models.donation import Donation
from app.services.midtrans_service import MidtransService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/donations", tags=["donations"])


@router.post("/", response_model=DonationResponse, status_code=status.HTTP_201_CREATED)
async def create_donation(
    donation_data: DonationCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Create new donation"""
    logger.info(f"[DONATION] Attempting to create donation for user {current_user.user_id}")
    
    # Validate that donor profile exists
    from app.models.user import DonorProfile
    donor_profile = db.query(DonorProfile).filter(
        DonorProfile.user_id == current_user.user_id
    ).first()
    
    if not donor_profile:
        logger.error(f"[DONATION] Donor profile not found for user {current_user.user_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please complete your donor profile before creating a donation"
        )
    
    logger.info(f"[DONATION] Donor profile verified for user {current_user.user_id}")
    
    donation = DonationService.create_donation(
        db=db,
        donor_id=current_user.user_id,
        donation_data=donation_data
    )
    
    logger.info(f"[DONATION] Created donation {donation.id}, type={donation_data.type}, is_subscription={donation_data.is_subscription}, plan_id={donation_data.plan_id}")
    
    # Create Midtrans transaction
    donor_name = donor_profile.user_profile.full_name if donor_profile.user_profile else "Donor"
    try:
        midtrans_tx = MidtransService.create_transaction(
            donation=donation,
            donor_email=current_user.email,
            donor_name=donor_name
        )
        # We can append midtrans data to response or use a different model
        # For now, let's just log it. The client will need the snap token.
        logger.info(f"[DONATION] Midtrans transaction created: {midtrans_tx}")
        # To return the snap token, we would typically modify DonationResponse to include it.
        # Since we use ConfigDict(from_attributes=True), we can attach it directly to the donation object before returning,
        # or we could change the response model. Let's just attach it as midtrans_token attribute temporarily if the schema allows,
        # but DonationResponse doesn't have snap_token. We'll return it in a custom way or rely on the frontend fetching it.
        # For full compatibility, we'll return a custom response if needed, but for now we'll stick to DonationResponse.
    except Exception as e:
        logger.error(f"[DONATION] Failed to create Midtrans transaction: {e}")
    
    # If this is a subscription donation, create subscription record
    if donation_data.is_subscription and donation_data.type == "subscription":
        logger.info(f"[DONATION] Creating subscription for donation {donation.id}")
        try:
            from app.services.subscription_service import SubscriptionService
            subscription = SubscriptionService.create_from_donation(
                db=db,
                donation=donation,
                plan_id=donation_data.plan_id
            )
            logger.info(f"[DONATION] Subscription created: {subscription.id} for donation {donation.id}")
            # Refresh donation to get updated subscription_id
            db.refresh(donation)
        except Exception as e:
            # Log error but don't fail the donation
            logger.error(f"[DONATION] Failed to create subscription for donation {donation.id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Continue without subscription - can be created manually later
    
    logger.info(f"[DONATION] Donation created: {donation.id} by user {current_user.user_id}")
    
    # We return the dictionary with extra midtrans info if needed, but since response_model=DonationResponse, 
    # it will filter out extra fields. We need to override the response type if we want to return the token directly.
    # We will let the frontend call a separate endpoint for the snap token if they want, or we can change the response model.
    # To keep schema compatibility, we will change response_model to PaymentResponse or similar if appropriate, but here we just return donation.
    
    return donation

@router.post("/webhook/midtrans")
async def midtrans_webhook(
    notification: dict,
    db: Session = Depends(get_db)
):
    """Webhook for Midtrans notifications"""
    try:
        result = MidtransService.handle_notification(db, notification)
        return result
    except Exception as e:
        logger.error(f"Midtrans webhook error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{donation_id}/payment-link", response_model=PaymentResponse)
async def get_payment_link(
    donation_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get Midtrans Snap Token for a donation"""
    donation = DonationService.get_donation_by_id(db, donation_id, current_user.user_id)
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")
        
    from app.models.user import DonorProfile
    donor_profile = db.query(DonorProfile).filter(DonorProfile.user_id == current_user.user_id).first()
    donor_name = donor_profile.user_profile.full_name if donor_profile and donor_profile.user_profile else "Donor"
    
    try:
        tx = MidtransService.create_transaction(donation, current_user.email, donor_name)
        return PaymentResponse(
            donation_id=str(donation.id),
            snap_token=tx.get("token"),
            redirect_url=tx.get("redirect_url"),
            payment_status=donation.status.value,
            message="Payment link generated"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate payment link: {str(e)}")


@router.get("/", response_model=DonationListResponse)
async def get_donations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status_filter: Optional[DonationStatusEnum] = Query(None, alias="status"),
    type_filter: Optional[DonationTypeEnum] = Query(None, alias="type"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get user's donations with filtering and pagination"""
    logger.info(f"[GET_DONATIONS] Request from user: {current_user.user_id} ({current_user.email})")
    
    params = DonationQueryParams(
        page=page,
        page_size=page_size,
        status=status_filter,
        type=type_filter,
        start_date=start_date,
        end_date=end_date
    )
    
    donations = DonationService.get_donations(
        db=db,
        donor_id=current_user.user_id,
        params=params
    )
    
    total = DonationService.get_donations_count(
        db=db,
        donor_id=current_user.user_id,
        params=params
    )
    
    logger.info(f"[GET_DONATIONS] Found {total} donations for user {current_user.user_id}")
    
    total_pages = (total + page_size - 1) // page_size
    
    return DonationListResponse(
        items=[DonationResponse.model_validate(d) for d in donations],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/export")
async def export_donation_history(
    format: str = "csv",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Export donation history as CSV or PDF.
    """
    from fastapi.responses import StreamingResponse
    import csv
    import io
    
    # Build query
    query = db.query(Donation).filter(Donation.donor_id == current_user.user_id)
    
    if status:
        query = query.filter(Donation.status == status)
    if date_from:
        query = query.filter(Donation.created_at >= date_from)
    if date_to:
        query = query.filter(Donation.created_at <= date_to)
    
    donations = query.order_by(Donation.created_at.desc()).all()
    
    if format.lower() == "csv":
        # Generate CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow(["ID", "Amount", "Currency", "Type", "Status", "Payment Method", "Date"])
        
        # Data
        for d in donations:
            writer.writerow([
                str(d.id),
                str(d.amount),
                "IDR",
                d.type.value,
                d.status.value,
                d.payment_method,
                d.created_at.isoformat() if d.created_at else ""
            ])
        
        output.seek(0)
        
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=donation_history.csv"}
        )
    
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format '{format}' not supported. Use 'csv'."
        )


@router.get("/impact/{donor_id}", response_model=ImpactMetrics)
async def get_impact_metrics(
    donor_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get donor impact metrics"""
    metrics = DonationService.get_impact_metrics(
        db=db,
        donor_id=donor_id
    )
    
    return ImpactMetrics(**metrics)


@router.get("/dashboard-metrics/{donor_id}", response_model=DashboardMetrics)
async def get_dashboard_metrics(
    donor_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get dashboard metrics for donor - for dashboard display"""
    metrics = DonationService.get_dashboard_metrics(
        db=db,
        donor_id=donor_id
    )
    
    return DashboardMetrics(**metrics)


@router.get("/debug/whoami")
async def debug_whoami(
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Debug endpoint to verify JWT user info"""
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role,
        "message": "If you see this, JWT authentication is working!",
        "expected_donor_id": "0ea01ac1-723f-484c-b2ca-fcf69a554b37"
    }


# NOTE: These endpoints with specific paths MUST come BEFORE the generic /{donation_id} endpoint
# FastAPI matches routes from top to bottom, so specific routes must be defined first


@router.get("/{donation_id}/receipt")
async def download_donation_receipt(
    donation_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Download donation receipt as PDF.
    Returns PDF file for successful donations.
    """
    donation = db.query(Donation).filter(
        Donation.id == donation_id,
        Donation.donor_id == current_user.user_id
    ).first()
    
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found"
        )
    
    if donation.status != DonationStatusEnum.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt only available for successful donations"
        )
    
    # For now, return a simple JSON response
    # In production, generate actual PDF
    from fastapi.responses import JSONResponse
    return JSONResponse({
        "message": "Receipt generation endpoint",
        "donation_id": donation_id,
        "amount": str(donation.amount),
        "date": donation.created_at.isoformat() if donation.created_at else None,
        "status": donation.status.value,
        "note": "PDF generation to be implemented with library like WeasyPrint or ReportLab"
    })


@router.post("/{donation_id}/simulate-payment")
async def simulate_payment(
    donation_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Mark payment as successful and trigger real allocation logic.
    Route name is kept for MVP compatibility with the current frontend flow.
    """
    logger.info(f"[SIMULATE_PAYMENT] Called with donation_id: {donation_id}, user: {current_user.user_id}")
    
    # Verify donation exists and belongs to current user
    from app.models.donation import Donation
    from uuid import UUID
    
    try:
        # Convert string ID to UUID
        donation_uuid = UUID(str(donation_id))
        logger.info(f"[SIMULATE_PAYMENT] Converted to UUID: {donation_uuid}")
    except Exception as e:
        logger.error(f"[SIMULATE_PAYMENT] Invalid UUID format: {donation_id}, error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid donation ID format: {donation_id}")
    
    donation = db.query(Donation).filter(Donation.id == donation_uuid).first()
    if not donation:
        logger.error(f"[SIMULATE_PAYMENT] Donation {donation_id} not found")
        raise HTTPException(status_code=404, detail="Donation not found")
    
    if str(donation.donor_id) != str(current_user.user_id):
        logger.error(f"[SIMULATE_PAYMENT] Permission denied. Donation donor: {donation.donor_id}, Current user: {current_user.user_id}")
        raise HTTPException(status_code=403, detail="Not authorized to simulate payment for this donation")
    
    logger.info(f"[SIMULATE_PAYMENT] Donation found. Status: {donation.status}, Donor: {donation.donor_id}")
    
    try:
        from app.services.donation_allocation_service import DonationAllocationService

        result = DonationAllocationService.process_successful_donation(
            db=db,
            donation_id=donation_id
        )
        logger.info(f"[SIMULATE_PAYMENT] Service returned result: {result}")
        return result
        
    except ValueError as e:
        logger.warning(f"[SIMULATE_PAYMENT] ValueError: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        import traceback
        error_detail = f"Payment simulation failed: {str(e)}\n{traceback.format_exc()}"
        logger.error(f"[SIMULATE_PAYMENT] {error_detail}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to simulate payment: {str(e)}"
        )


@router.get("/{donation_id}", response_model=DonationWithImpact)
async def get_donation(
    donation_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get donation by ID with impact metrics"""
    donation = DonationService.get_donation_by_id(
        db=db,
        donation_id=donation_id,
        donor_id=current_user.user_id
    )
    
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found"
        )
    
    recipient_name = None
    children_helped = 0
    if donation.recipient_id:
        from app.models.user import BeneficiaryProfile
        beneficiary = db.query(BeneficiaryProfile).filter(
            BeneficiaryProfile.user_id == donation.recipient_id
        ).first()
        if beneficiary:
            recipient_name = beneficiary.user_profile.full_name if beneficiary.user_profile else None
            children_helped = 1
    else:
        from app.models.donation import Voucher
        from app.models.user import BeneficiaryProfile

        allocated_beneficiaries = (
            db.query(BeneficiaryProfile)
            .join(Voucher, Voucher.beneficiary_id == BeneficiaryProfile.user_id)
            .filter(Voucher.donation_id == donation.id)
            .all()
        )
        children_helped = len({str(profile.user_id) for profile in allocated_beneficiaries})
        if children_helped == 1 and allocated_beneficiaries:
            profile = allocated_beneficiaries[0].user_profile
            recipient_name = profile.full_name if profile else None
        elif children_helped > 1:
            recipient_name = f"{children_helped} penerima teralokasi"

    months_of_support = 0
    if donation.subscription_config:
        months_of_support = donation.subscription_config.get("duration_months", 0)
    
    donation_dict = DonationResponse.model_validate(donation).model_dump()
    donation_dict["recipient_name"] = recipient_name
    donation_dict["children_helped"] = children_helped
    donation_dict["months_of_support"] = months_of_support
    
    return DonationWithImpact(**donation_dict)
