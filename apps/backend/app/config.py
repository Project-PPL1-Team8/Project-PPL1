"""
Application Configuration
Loads environment variables and provides settings for the application.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path
from typing import Optional
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENV_FILES = (
    str(BACKEND_DIR / ".env"),
    str(PROJECT_ROOT / ".env"),
    ".env",
)


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENV_FILES = (
    str(BACKEND_DIR / ".env"),
    str(PROJECT_ROOT / ".env"),
    ".env",
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Application
    APP_NAME: str = "NutriGuard API"
    APP_VERSION: str = "1.0.0"
    API_VERSION: str = "v1"
    LOG_LEVEL: str = "INFO"
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174"
    
    # Database (Supabase PostgreSQL)
    # Optional: defaults to in-memory SQLite for testing
    DATABASE_URL: Optional[str] = None
    
    # Supabase
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_SERVICE_KEY: Optional[str] = None
    
    # Midtrans
    MIDTRANS_SERVER_KEY: Optional[str] = None
    MIDTRANS_CLIENT_KEY: Optional[str] = None
    MIDTRANS_IS_PRODUCTION: bool = False
    
    # JWT (Optional - if using custom JWT)
    JWT_SECRET_KEY: str = "your-secret-key-min-32-chars-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    # Storage
    STORAGE_BUCKET_NAME: str = "nutriguard-uploads"
    MAX_FILE_SIZE_MB: int = 5
    
    # Settlement & Reporting Configuration
    ADMIN_FEE_PERCENTAGE: float = 1.0  # 1% admin fee for settlements
    SETTLEMENT_ENABLED: bool = True
    PAYOUT_ENABLED: bool = True
    REPORT_CACHING_TTL_SECONDS: int = 86400  # 24 hours
    
    # Scheduler Configuration
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_TIMEZONE: str = "UTC"
    
    # Settlement Schedule (cron format)
    SETTLEMENT_SCHEDULE_DAY: int = 0  # 0 = Monday
    SETTLEMENT_SCHEDULE_HOUR: int = 1
    SETTLEMENT_SCHEDULE_MINUTE: int = 0
    
    # Payout Schedule (cron format)
    PAYOUT_SCHEDULE_HOUR: int = 6
    PAYOUT_SCHEDULE_MINUTE: int = 0
    
    # Report Generation Schedule (cron format)
    REPORT_SCHEDULE_HOUR: int = 23
    REPORT_SCHEDULE_MINUTE: int = 0
    
    # Bank Configuration
    SUPPORTED_BANKS: str = "BCA,MANDIRI,BRI,BNI,CIMB,OCBC,AMBANK"
    BANK_VALIDATION_ENABLED: bool = True
    
    # Dev mode flag (enables mock auth for demo buttons)
    DEV_MODE: bool = False
    
    # Test mode flag
    TEST_MODE: bool = False
    
    model_config = SettingsConfigDict(
        env_file=ENV_FILES,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )
    
    def is_test_mode(self) -> bool:
        """Check if running in test mode"""
        import sys
        return self.TEST_MODE or "pytest" in sys.modules
    
    def get_database_url(self) -> str:
        """Get database URL with fallback for testing"""
        if self.is_test_mode() or not self.DATABASE_URL:
            # Use in-memory SQLite for testing
            return "sqlite:///:memory:"
        return self.DATABASE_URL


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    """
    return Settings()


# Convenience function to access settings
settings = get_settings()
