"""
Product Router
Handles product catalog and category management
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from decimal import Decimal
from uuid import UUID as _UUID

from app.database import get_db
from app.services.product_service import ProductService
from app.middleware.auth import get_current_user, AuthenticatedUser, RequireRole, OptionalAuth
from app.schemas.product import (
    CategoryResponse,
    CategoryCreate,
    ProductResponse,
    ProductCreate,
    ProductUpdate,
    ProductListResponse,
    ProductQueryParams,
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(db: Session = Depends(get_db)):
    """List all active categories"""
    return ProductService.get_categories(db)


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(RequireRole(["admin"])),
):
    """Create a new category (admin only)"""
    return ProductService.create_category(db, data)


@router.get("/", response_model=ProductListResponse)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: Optional[str] = None,
    search: Optional[str] = None,
    vendor_id: Optional[str] = None,
    min_price: Optional[str] = None,
    max_price: Optional[str] = None,
    in_stock_only: bool = False,
    db: Session = Depends(get_db),
    current_user: Optional[AuthenticatedUser] = Depends(OptionalAuth),
):
    """List products with filters"""
    params = ProductQueryParams(
        page=page,
        page_size=page_size,
        category_id=_UUID(category_id) if category_id else None,
        search=search,
        vendor_id=_UUID(vendor_id) if vendor_id else None,
        min_price=Decimal(min_price) if min_price else None,
        max_price=Decimal(max_price) if max_price else None,
        in_stock_only=in_stock_only,
    )

    include_unapproved = bool(
        current_user
        and current_user.role in ["vendor", "admin"]
        and (
            current_user.role == "admin"
            or (params.vendor_id is not None and str(params.vendor_id) == str(current_user.user_id))
        )
    )

    products = ProductService.get_products(db, params, include_unapproved=include_unapproved)
    total = ProductService.get_products_count(db, params, include_unapproved=include_unapproved)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    items = []
    for p in products:
        p_dict = ProductResponse.model_validate(p).model_dump()
        if p.category:
            p_dict["category_name"] = p.category.name
        if p.vendor_profile:
            p_dict["vendor_store_name"] = p.vendor_profile.store_name
        items.append(ProductResponse(**p_dict))

    return ProductListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[AuthenticatedUser] = Depends(OptionalAuth),
):
    """Get product by ID"""
    include_unapproved = bool(current_user and current_user.role in ["vendor", "admin"])
    product = ProductService.get_product_by_id(db, product_id, include_unapproved=include_unapproved)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if product.approval_status != "approved":
        is_admin = bool(current_user and current_user.role == "admin")
        is_owner = bool(current_user and str(current_user.user_id) == str(product.vendor_id))
        if not (is_admin or is_owner):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    p_dict = ProductResponse.model_validate(product).model_dump()
    if product.category:
        p_dict["category_name"] = product.category.name
    if product.vendor_profile:
        p_dict["vendor_store_name"] = product.vendor_profile.store_name
    return ProductResponse(**p_dict)


@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a new product (vendor only, auto-set approval_status=pending)"""
    return ProductService.create_product(db, current_user.user_id, data)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    data: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Update own product (vendor only, resets approval if price/stock changed)"""
    product = ProductService.update_product(db, product_id, current_user.user_id, data)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found or not yours")

    p_dict = ProductResponse.model_validate(product).model_dump()
    if product.category:
        p_dict["category_name"] = product.category.name
    return ProductResponse(**p_dict)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Soft delete product (vendor only, blocked if has active orders)"""
    try:
        success = ProductService.delete_product(db, product_id, current_user.user_id)
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found or not yours")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
