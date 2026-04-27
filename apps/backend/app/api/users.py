"""
User/Auth Router
Handles user profile creation on signup
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import logging
from uuid import UUID

from app.database import get_db
from app.models.user import UserProfile, DonorProfile, BeneficiaryProfile, VendorProfile, GenderEnum
from app.schemas.user import (
    UserSignUpRequest,
    UserSignUpResponse,
    UserProfileUpdateRequest,
    UserProfileResponse,
    UserRole
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


def _resolve_user_role(db: Session, user_id: UUID) -> UserRole | None:
    """Resolve user role from role-specific profile tables."""
    donor_profile = db.query(DonorProfile).filter(DonorProfile.user_id == user_id).first()
    if donor_profile:
        if donor_profile.corporate_name:
            return "corporate_donor"
        return "donor"

    if db.query(BeneficiaryProfile).filter(BeneficiaryProfile.user_id == user_id).first():
        return "beneficiary"

    if db.query(VendorProfile).filter(VendorProfile.user_id == user_id).first():
        return "vendor"

    return None


def _build_user_profile_response(db: Session, user_profile: UserProfile) -> UserProfileResponse:
    resolved_role = _resolve_user_role(db, user_profile.user_id)
    gender_value = user_profile.gender.value if user_profile.gender else None

    return UserProfileResponse(
        id=user_profile.id,
        user_id=user_profile.user_id,
        full_name=user_profile.full_name,
        role=resolved_role,
        phone=user_profile.phone,
        address=user_profile.address,
        date_of_birth=user_profile.date_of_birth,
        gender=gender_value,
        avatar_url=user_profile.avatar_url,
        created_at=user_profile.created_at,
        updated_at=user_profile.updated_at,
    )


@router.post("/signup", response_model=UserSignUpResponse, status_code=status.HTTP_201_CREATED)
async def create_user_on_signup(
    user_data: UserSignUpRequest,
    db: Session = Depends(get_db)
):
    """
    Create a new user profile after Supabase signup.
    Called by frontend after successful Supabase authentication.
    
    This endpoint:
    1. Creates a user_profiles entry
    2. Creates role-specific profile (donor_profiles, beneficiary_profiles, or vendor_profiles)
    """
    logger.info(f"[SIGNUP] Starting signup for user: {user_data.user_id}, role: {user_data.role}, name: {user_data.full_name}")
    
    try:
        # Check if user already exists
        logger.info(f"[SIGNUP] Checking if user already exists: {user_data.user_id}")
        existing_user = db.query(UserProfile).filter(
            UserProfile.user_id == user_data.user_id
        ).first()
        
        if existing_user:
            logger.warning(f"[SIGNUP] User already exists: {user_data.user_id}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User profile already exists for this user ID"
            )
        
        # Create base user profile
        logger.info(f"[SIGNUP] Creating user_profile for: {user_data.user_id}")
        user_profile = UserProfile(
            user_id=user_data.user_id,
            full_name=user_data.full_name,
            phone=user_data.phone,
            address=user_data.address,
        )
        db.add(user_profile)
        db.flush()  # Flush to ensure the profile is created before adding role-specific profiles
        logger.info(f"[SIGNUP] user_profile flushed successfully for: {user_data.user_id}")
        
        # Create role-specific profile
        if user_data.role == "donor" or user_data.role == "corporate_donor":
            logger.info(f"[SIGNUP] Creating donor_profile for user {user_data.user_id}")
            donor_profile = DonorProfile(
                user_id=user_data.user_id,
                total_donated=0,
                children_sponsored=0,
                subscription_status="inactive"
            )
            db.add(donor_profile)
            logger.info(f"[SIGNUP] donor_profile added for user {user_data.user_id}")
        
        elif user_data.role == "beneficiary":
            logger.info(f"[SIGNUP] Creating beneficiary_profile for user {user_data.user_id}")
            beneficiary_profile = BeneficiaryProfile(
                user_id=user_data.user_id,
                family_size=1,
                vouchers_balance=0
            )
            db.add(beneficiary_profile)
            logger.info(f"[SIGNUP] beneficiary_profile added for user {user_data.user_id}")
        
        elif user_data.role == "vendor":
            logger.info(f"[SIGNUP] Creating vendor_profile for user {user_data.user_id}")
            vendor_profile = VendorProfile(
                user_id=user_data.user_id,
                store_name=user_data.full_name,  # Use full_name as default store name
                store_address="",
                approval_status="pending"
            )
            db.add(vendor_profile)
            logger.info(f"[SIGNUP] vendor_profile added for user {user_data.user_id}")
        
        else:
            logger.warning(f"[SIGNUP] Unknown role: {user_data.role}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown role: {user_data.role}"
            )
        
        # Commit all changes
        logger.info(f"[SIGNUP] Committing all changes for user {user_data.user_id}")
        db.commit()
        
        logger.info(f"[SIGNUP] ✓ User profile created successfully for {user_data.user_id} with role {user_data.role}")
        
        return UserSignUpResponse(
            user_id=user_data.user_id,
            full_name=user_data.full_name,
            role=user_data.role,
            message="User created successfully"
        )
    
    except HTTPException:
        db.rollback()
        raise
    
    except IntegrityError as e:
        db.rollback()
        logger.error(f"[SIGNUP] IntegrityError creating user profile for {user_data.user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User profile creation failed: {str(e.orig)}"
        )
    
    except Exception as e:
        db.rollback()
        logger.error(f"[SIGNUP] Unexpected error creating user profile for {user_data.user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user profile: {str(e)}"
        )


@router.get("/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: UUID,
    db: Session = Depends(get_db)
):
    """Get user profile by user ID"""
    user_profile = db.query(UserProfile).filter(
        UserProfile.user_id == user_id
    ).first()
    
    if not user_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found"
        )

    return _build_user_profile_response(db, user_profile)


@router.patch("/{user_id}", response_model=UserProfileResponse)
async def update_user_profile(
    user_id: UUID,
    update_data: UserProfileUpdateRequest,
    db: Session = Depends(get_db)
):
    """Update existing user profile fields."""
    user_profile = db.query(UserProfile).filter(
        UserProfile.user_id == user_id
    ).first()

    if not user_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found"
        )

    payload = update_data.model_dump(exclude_unset=True)
    if not payload:
        return _build_user_profile_response(db, user_profile)

    if "full_name" in payload:
        full_name = (payload.get("full_name") or "").strip()
        if not full_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="full_name cannot be empty"
            )
        user_profile.full_name = full_name

    if "phone" in payload:
        phone = payload.get("phone")
        user_profile.phone = phone.strip() if isinstance(phone, str) and phone.strip() else None

    if "address" in payload:
        address = payload.get("address")
        user_profile.address = address.strip() if isinstance(address, str) and address.strip() else None

    if "date_of_birth" in payload:
        user_profile.date_of_birth = payload.get("date_of_birth")

    if "gender" in payload:
        gender = payload.get("gender")
        user_profile.gender = GenderEnum(gender) if gender else None

    try:
        db.commit()
        db.refresh(user_profile)
    except Exception as exc:
        db.rollback()
        logger.error(f"[PROFILE] Failed to update user profile {user_id}: {str(exc)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user profile"
        ) from exc

    return _build_user_profile_response(db, user_profile)
