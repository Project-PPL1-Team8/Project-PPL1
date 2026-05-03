"""
Order Schemas
Pydantic schemas for order management
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from decimal import Decimal


# ============================================
# Order Item Schemas
# ============================================
class OrderItemCreate(BaseModel):
    product_id: UUID
    quantity: int = Field(..., gt=0)
    price: Decimal = Field(..., gt=0)


class OrderItemResponse(BaseModel):
    id: UUID
    order_id: UUID
    product_id: UUID
    quantity: int
    price: Decimal
    subtotal: Decimal
    product_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Order Schemas
# ============================================
class OrderCreate(BaseModel):
    vendor_id: UUID
    items: List[OrderItemCreate] = Field(..., min_length=1)
    voucher_codes: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class OrderResponse(BaseModel):
    id: UUID
    user_id: UUID = Field(alias="beneficiary_id")
    vendor_id: UUID
    cart_total: Decimal = Field(alias="total_amount")
    voucher_discount: Decimal = Field(alias="voucher_used")
    cash_amount: Decimal = Field(alias="cash_paid")
    status: str
    payment_status: str
    notes: Optional[str] = None
    vendor_store_name: Optional[str] = None
    items: List[OrderItemResponse] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class OrderDetailResponse(OrderResponse):
    items: List[OrderItemResponse] = []


class OrderListResponse(BaseModel):
    items: List[OrderResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============================================
# Order Status Update
# ============================================
class OrderStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(completed|cancelled)$")


# ============================================
# Query Parameters
# ============================================
class OrderQueryParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    status: Optional[str] = None
    search: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
