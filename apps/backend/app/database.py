"""
Database Configuration and Session Management
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.pool import StaticPool
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# Get database URL from settings (handles test mode automatically)
DATABASE_URL = settings.get_database_url()

# Detect if using SQLite
IS_SQLITE = DATABASE_URL.startswith("sqlite")


def _create_sqlite_engine(url: str = "sqlite:///:memory:"):
    """Create a SQLite engine with appropriate settings."""
    kwargs = {
        "connect_args": {"check_same_thread": False},
    }
    if url == "sqlite:///:memory:":
        kwargs["poolclass"] = StaticPool
    return create_engine(url, **kwargs)


def _create_postgres_engine(url: str):
    """Create a PostgreSQL engine with connection pooling."""
    return create_engine(
        url,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=3600,
    )


def _build_engine():
    """Build the database engine, falling back to SQLite if PostgreSQL is unreachable."""
    global IS_SQLITE

    if IS_SQLITE:
        return _create_sqlite_engine(DATABASE_URL)

    # Try to connect to PostgreSQL
    pg_engine = _create_postgres_engine(DATABASE_URL)
    try:
        with pg_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Connected to PostgreSQL database successfully")
        return pg_engine
    except Exception as exc:
        logger.warning(
            "PostgreSQL unreachable (%s). Falling back to in-memory SQLite.",
            exc,
        )
        pg_engine.dispose()
        IS_SQLITE = True
        return _create_sqlite_engine()


engine = _build_engine()

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db() -> Session:
    """
    Dependency to get database session.
    Yields a database session and ensures it's closed after use.
    
    Usage in FastAPI routes:
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Initialize database by creating all tables.
    This is typically run once during deployment.
    
    Note: In production, use Alembic migrations instead.
    """
    # Import all models to ensure they're registered with Base
    # This will be uncommented as we create models
    # from app.models import user, donor, beneficiary, vendor, donation, voucher, product, order, nutrition, settlement
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    logger.info("Database tables created successfully!")
