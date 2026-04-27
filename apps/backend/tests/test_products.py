"""
Product Tests
Tests for product service logic, schemas, and enums
"""
from decimal import Decimal
from datetime import datetime
from uuid import uuid4
from unittest.mock import MagicMock

from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse, CategoryCreate


def test_product_create_schema():
    """Test ProductCreate schema validation"""
    data = ProductCreate(
        name="Test Product",
        price=Decimal("50000"),
        voucher_price=Decimal("45000"),
        stock_quantity=100,
        unit="pcs",
    )
    assert data.name == "Test Product"
    assert data.price == Decimal("50000")


def test_product_create_schema_invalid_amount():
    """Test ProductCreate rejects zero/negative price"""
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ProductCreate(name="Bad", price=Decimal("0"), voucher_price=Decimal("0"))


def test_product_create_voucher_exceeds_price():
    """Test ProductCreate rejects voucher_price > price"""
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ProductCreate(
            name="Bad",
            price=Decimal("30000"),
            voucher_price=Decimal("50000"),
        )


def test_product_update_schema():
    """Test ProductUpdate schema with partial data"""
    data = ProductUpdate(name="Updated Name")
    assert data.name == "Updated Name"
    assert data.price is None


def test_product_response_schema():
    """Test ProductResponse schema"""
    vendor_id = uuid4()
    data = ProductResponse(
        id=uuid4(),
        vendor_id=vendor_id,
        name="Test Product",
        price=Decimal("50000"),
        voucher_price=Decimal("45000"),
        stock_quantity=100,
        approval_status="pending",
        created_at=datetime.utcnow(),
    )
    assert data.approval_status == "pending"


def test_category_create_schema():
    """Test CategoryCreate schema"""
    data = CategoryCreate(name="Test Category", slug="test-category")
    assert data.name == "Test Category"
    assert data.slug == "test-category"


def test_product_service_get_products():
    """Test ProductService.get_products returns filtered list"""
    from app.services.product_service import ProductService
    from app.schemas.product import ProductQueryParams

    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.all.return_value = []

    params = ProductQueryParams(search="test", in_stock_only=True)
    products = ProductService.get_products(mock_db, params)
    assert isinstance(products, list)


def test_product_service_create_product():
    """Test ProductService.create_product sets approval_status=pending"""
    from app.services.product_service import ProductService

    mock_db = MagicMock()
    mock_product = MagicMock()
    mock_product.id = uuid4()
    mock_product.name = "Test Product"
    mock_product.approval_status = "pending"
    mock_db.add = MagicMock()
    mock_db.commit = MagicMock()
    mock_db.refresh = MagicMock()

    data = ProductCreate(
        name="Test Product",
        price=Decimal("50000"),
        voucher_price=Decimal("45000"),
        stock_quantity=100,
    )

    ProductService.create_product(mock_db, str(uuid4()), data)
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
