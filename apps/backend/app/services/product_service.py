"""
Product Service
Business logic for category and product management
"""
from sqlalchemy.orm import Session
from typing import Optional, List
import logging

from app.models.product import Category, Product, Order
from app.schemas.product import CategoryCreate, ProductCreate, ProductUpdate, ProductQueryParams

logger = logging.getLogger(__name__)


class ProductService:
    @staticmethod
    def get_categories(db: Session) -> List[Category]:
        return db.query(Category).filter(
            Category.is_active
        ).order_by(Category.display_order).all()

    @staticmethod
    def create_category(db: Session, data: CategoryCreate) -> Category:
        category = Category(
            name=data.name,
            slug=data.slug or data.name.lower().replace(" ", "-"),
            description=data.description,
            icon_url=data.icon_url,
            display_order=data.display_order,
        )
        db.add(category)
        db.commit()
        db.refresh(category)
        return category

    @staticmethod
    def get_products(
        db: Session,
        params: ProductQueryParams,
        include_unapproved: bool = False,
    ) -> List[Product]:
        query = db.query(Product).filter(Product.is_active)
        if not include_unapproved:
            query = query.filter(Product.approval_status == "approved")

        if params.category_id:
            query = query.filter(Product.category_id == params.category_id)
        if params.vendor_id:
            query = query.filter(Product.vendor_id == params.vendor_id)
        if params.search:
            query = query.filter(Product.name.ilike(f"%{params.search}%"))
        if params.min_price is not None:
            query = query.filter(Product.price >= params.min_price)
        if params.max_price is not None:
            query = query.filter(Product.price <= params.max_price)
        if params.in_stock_only:
            query = query.filter(Product.stock_quantity > 0)

        return query.order_by(Product.created_at.desc()).all()

    @staticmethod
    def get_products_count(
        db: Session,
        params: ProductQueryParams,
        include_unapproved: bool = False,
    ) -> int:
        query = db.query(Product).filter(Product.is_active)
        if not include_unapproved:
            query = query.filter(Product.approval_status == "approved")

        if params.category_id:
            query = query.filter(Product.category_id == params.category_id)
        if params.vendor_id:
            query = query.filter(Product.vendor_id == params.vendor_id)
        if params.search:
            query = query.filter(Product.name.ilike(f"%{params.search}%"))
        if params.min_price is not None:
            query = query.filter(Product.price >= params.min_price)
        if params.max_price is not None:
            query = query.filter(Product.price <= params.max_price)
        if params.in_stock_only:
            query = query.filter(Product.stock_quantity > 0)

        return query.count()

    @staticmethod
    def get_product_by_id(
        db: Session,
        product_id: str,
        include_unapproved: bool = False,
    ) -> Optional[Product]:
        query = db.query(Product).filter(
            Product.id == product_id,
            Product.is_active
        )
        if not include_unapproved:
            query = query.filter(Product.approval_status == "approved")
        return query.first()

    @staticmethod
    def create_product(db: Session, vendor_id: str, data: ProductCreate) -> Product:
        product = Product(
            vendor_id=vendor_id,
            category_id=data.category_id,
            name=data.name,
            description=data.description,
            price=data.price,
            voucher_price=data.voucher_price,
            stock_quantity=data.stock_quantity,
            unit=data.unit,
            approval_status="pending",
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        logger.info(f"Product created: {product.id} by vendor {vendor_id}")
        return product

    @staticmethod
    def update_product(db: Session, product_id: str, vendor_id: str, data: ProductUpdate) -> Optional[Product]:
        product = db.query(Product).filter(
            Product.id == product_id,
            Product.vendor_id == vendor_id,
            Product.is_active
        ).first()

        if not product:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(product, key, value)

        if update_data:
            product.approval_status = "pending"

        db.commit()
        db.refresh(product)
        logger.info(f"Product updated: {product.id}")
        return product

    @staticmethod
    def delete_product(db: Session, product_id: str, vendor_id: str) -> bool:
        product = db.query(Product).filter(
            Product.id == product_id,
            Product.vendor_id == vendor_id,
            Product.is_active
        ).first()

        if not product:
            return False

        has_active_orders = db.query(Order).join(
            Order.items
        ).filter(
            Order.items.any(product_id=product_id),
            Order.status.in_(["pending", "processing"])
        ).first()

        if has_active_orders:
            raise ValueError("Cannot delete product with active orders")

        product.is_active = False
        db.commit()
        logger.info(f"Product soft-deleted: {product_id}")
        return True
