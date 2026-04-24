"""
Authentication Middleware
Supports both Supabase JWT validation (production) and mock auth (development)
"""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
import logging
import os
import json
import base64
from uuid import UUID

from app.services.supabase_auth import supabase_auth
from app.config import settings
from app.database import SessionLocal
from app.models.user import UserProfile, DonorProfile, BeneficiaryProfile, VendorProfile

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)
DEV_ALLOWED_ROLES = {
    "donor",
    "beneficiary",
    "vendor",
    "admin",
    "government",
    "corporate_donor",
}


class AuthenticatedUser:
    """Authenticated user information"""
    
    def __init__(self, user_id: str | UUID, email: str, role: str, email_verified: bool = False):
        # Keep UUID type for UUID-backed DB columns.
        self.user_id = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
        self.email = email
        self.role = role
        self.email_verified = email_verified


def _has_supabase_auth_config() -> bool:
    """Check whether required Supabase auth settings are available."""
    return bool(settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY)


def is_dev_mode() -> bool:
    # Check whether auth should use local mock mode.
    # First check OS environment variable, then pydantic settings (from .env)
    dev_env = os.getenv("DEV_MODE", "").lower()
    if dev_env == "true":
        return True
    return settings.DEV_MODE or not _has_supabase_auth_config()


def _mock_dev_user() -> AuthenticatedUser:
    """Return deterministic mock user for local development without session token."""
    return AuthenticatedUser(
        user_id="00000000-0000-0000-0000-000000000001",
        email="donor@nutriguard.id",
        role="donor",
        email_verified=True,
    )


def _dev_user_from_headers(request: Request) -> Optional[AuthenticatedUser]:
    """Build development user identity from frontend-provided headers."""
    raw_user_id = request.headers.get("x-dev-user-id")
    if not raw_user_id:
        return None

    try:
        user_id = UUID(str(raw_user_id))
    except ValueError:
        logger.warning("[AUTH] Invalid x-dev-user-id header: %s", raw_user_id)
        return None

    role = (request.headers.get("x-dev-user-role") or "donor").strip().lower()
    if role not in DEV_ALLOWED_ROLES:
        role = "donor"

    email = (request.headers.get("x-dev-user-email") or f"{role}@nutriguard.id").strip()
    if not email:
        email = f"{role}@nutriguard.id"

    return AuthenticatedUser(
        user_id=user_id,
        email=email,
        role=role,
        email_verified=True,
    )


def _resolve_role_from_db(user_id: UUID, fallback_role: str) -> str:
    """Resolve role from local profile tables, fallback to provided role."""
    db = SessionLocal()
    try:
        if db.query(BeneficiaryProfile).filter(BeneficiaryProfile.user_id == user_id).first():
            return "beneficiary"

        if db.query(VendorProfile).filter(VendorProfile.user_id == user_id).first():
            return "vendor"

        donor = db.query(DonorProfile).filter(DonorProfile.user_id == user_id).first()
        if donor:
            if donor.corporate_name:
                return "corporate_donor"
            return "donor"

        if db.query(UserProfile).filter(UserProfile.user_id == user_id).first():
            return fallback_role

        return fallback_role
    except Exception as exc:
        logger.warning("[AUTH] Failed to resolve role from DB for %s: %s", user_id, str(exc))
        return fallback_role
    finally:
        db.close()


def _decode_unverified_jwt_payload(token: str) -> Optional[dict]:
    """Decode JWT payload without signature verification (development fallback only)."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload_segment = parts[1]
        payload_segment += "=" * (-len(payload_segment) % 4)
        decoded = base64.urlsafe_b64decode(payload_segment.encode("utf-8")).decode("utf-8")
        payload = json.loads(decoded)
        if isinstance(payload, dict):
            return payload
        return None
    except Exception:
        return None


def _dev_user_from_unverified_token(token: str) -> Optional[AuthenticatedUser]:
    """Build development user identity from unverified token payload."""
    payload = _decode_unverified_jwt_payload(token)
    if not payload:
        return None

    raw_user_id = payload.get("sub") or payload.get("user_id")
    if not raw_user_id:
        return None

    try:
        user_id = UUID(str(raw_user_id))
    except ValueError:
        return None

    user_metadata = payload.get("user_metadata") if isinstance(payload.get("user_metadata"), dict) else {}
    app_metadata = payload.get("app_metadata") if isinstance(payload.get("app_metadata"), dict) else {}

    raw_role = user_metadata.get("role") or app_metadata.get("role") or payload.get("role") or "donor"
    role = str(raw_role).strip().lower()
    if role not in DEV_ALLOWED_ROLES:
        role = "donor"
    role = _resolve_role_from_db(user_id, role)

    raw_email = payload.get("email") or user_metadata.get("email")
    email = str(raw_email).strip() if raw_email else f"{role}@nutriguard.id"
    if not email:
        email = f"{role}@nutriguard.id"

    return AuthenticatedUser(
        user_id=user_id,
        email=email,
        role=role,
        email_verified=True,
    )


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> AuthenticatedUser:
    """
    Get current authenticated user.
    
    In production: Validates JWT token with Supabase
    In development: Returns mock user for testing
    """
    dev_mode = is_dev_mode()

    # In development mode, allow missing token by falling back to mock user.
    # If a token is provided, always validate it so role-sensitive endpoints
    # (e.g. beneficiary cart) can use the real authenticated role.
    if not credentials:
        if dev_mode:
            dev_user = _dev_user_from_headers(request)
            if dev_user:
                logger.debug("Using development header authentication for user %s", dev_user.user_id)
                return dev_user

            logger.debug("Using mock authentication (development mode, no token)")
            return _mock_dev_user()

        logger.warning("[AUTH] Request without credentials - returning 401")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Production mode - validate Supabase JWT
    try:
        logger.info("[AUTH] Verifying JWT token...")
        token_data = await supabase_auth.verify_token(credentials.credentials)
        user_info = supabase_auth.extract_user_info(token_data)
        
        fallback_role = user_info.get("role") or "donor"
        actual_role = _resolve_role_from_db(UUID(str(user_info["user_id"])), fallback_role)
        
        logger.info(f"[AUTH] JWT verified - user_id: {user_info['user_id']}, email: {user_info['email']}, role: {actual_role}")
        
        return AuthenticatedUser(
            user_id=user_info["user_id"],
            email=user_info["email"],
            role=actual_role,
            email_verified=user_info["email_verified"]
        )
        
    except ValueError as e:
        if dev_mode:
            dev_user = _dev_user_from_headers(request)
            if dev_user:
                logger.debug("Using development header fallback for user %s", dev_user.user_id)
                return dev_user

            dev_user_from_token = _dev_user_from_unverified_token(credentials.credentials)
            if dev_user_from_token:
                logger.debug("Using development unverified-token fallback for user %s", dev_user_from_token.user_id)
                return dev_user_from_token

            logger.warning("[AUTH] Token invalid in development mode, falling back to mock user: %s", str(e))
            return _mock_dev_user()

        logger.error(f"Authentication failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        if dev_mode:
            dev_user = _dev_user_from_headers(request)
            if dev_user:
                logger.debug("Using development header fallback for user %s", dev_user.user_id)
                return dev_user

            dev_user_from_token = _dev_user_from_unverified_token(credentials.credentials)
            if dev_user_from_token:
                logger.debug("Using development unverified-token fallback for user %s", dev_user_from_token.user_id)
                return dev_user_from_token

            logger.warning("[AUTH] Unexpected auth error in development mode, falling back to mock user: %s", str(e))
            return _mock_dev_user()

        logger.error(f"Unexpected authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service error"
        )


def RequireRole(allowed_roles: List[str]):
    """
    Dependency to require specific roles.
    
    Usage:
        @router.get("/admin")
        async def admin_endpoint(user: AuthenticatedUser = Depends(RequireRole(["admin"]))):
            ...
    """
    async def role_checker(
        current_user: AuthenticatedUser = Depends(get_current_user)
    ) -> AuthenticatedUser:
        # Check if user has any of the allowed roles
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {', '.join(allowed_roles)}"
            )
        return current_user
    
    return role_checker


async def OptionalAuth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[AuthenticatedUser]:
    """
    Optional authentication - returns user if authenticated, None otherwise.
    Useful for endpoints that work for both authenticated and anonymous users.
    """
    if not credentials:
        return None
    
    try:
        token_data = await supabase_auth.verify_token(credentials.credentials)
        user_info = supabase_auth.extract_user_info(token_data)
        
        return AuthenticatedUser(
            user_id=user_info["user_id"],
            email=user_info["email"],
            role=user_info["role"],
            email_verified=user_info["email_verified"]
        )
    except Exception:
        return None
