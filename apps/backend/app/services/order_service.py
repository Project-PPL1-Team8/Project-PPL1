"""
Order Service
Business logic for order processing with atomic transactions
"""
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from decimal import Decimal
import logging
from uuid import UUID

from app.models.product import Order, OrderItem, OrderStatusEnum, Product
from app.models.donation import Voucher, VoucherRedemption, VoucherStatusEnum
from app.models.user import BeneficiaryProfile, UserProfile, VendorProfile
from app.schemas.order import OrderCreate, OrderStatusUpdate, OrderQueryParams

logger = logging.getLogger(__name__)


class OrderService:
    @staticmethod
    def _to_uuid(value: Optional[str | UUID]) -> Optional[UUID]:
        """Normalize incoming ID values to UUID for UUID-backed columns."""
        if value is None:
            return None
        if isinstance(value, UUID):
            return value
        return UUID(str(value))

    @staticmethod
    def _apply_search(query, search: Optional[str]):
        if not search:
            return query

        search_term = search.strip()
        if not search_term:
            return query

        like_term = f"%{search_term}%"
        return query.filter(
            or_(
                Order.notes.ilike(like_term),
                Order.beneficiary_profile.has(
                    BeneficiaryProfile.user_profile.has(
                        or_(
                            UserProfile.full_name.ilike(like_term),
                            UserProfile.phone.ilike(like_term),
                        )
                    )
                ),
                Order.vendor_profile.has(VendorProfile.store_name.ilike(like_term)),
            )
        )

    @staticmethod
    def create_order(db: Session, beneficiary_id: str, data: OrderCreate) -> Order:
        try:
            beneficiary_uuid = OrderService._to_uuid(beneficiary_id)
            vendor_uuid = OrderService._to_uuid(data.vendor_id)
            total_amount = Decimal(0)

            # Validate all products first
            validated_items = []
            for item in data.items:
                product = db.query(Product).filter(
                    Product.id == item.product_id,
                    Product.is_active,
                    Product.approval_status == "approved"
                ).first()

                if not product:
                    raise ValueError(f"Product not found or not approved: {item.product_id}")

                if product.stock_quantity < item.quantity:
                    raise ValueError(f"Insufficient stock for {product.name}: have {product.stock_quantity}, need {item.quantity}")

                validated_items.append((product, item))
                total_amount += item.price * item.quantity

            # Process voucher redemption
            voucher_used = Decimal(0)
            redemptions_to_create = []

            if data.voucher_codes:
                remaining = total_amount
                for code in data.voucher_codes:
                    voucher = db.query(Voucher).filter(
                        Voucher.code == code,
                        Voucher.beneficiary_id == beneficiary_uuid,
                        Voucher.status == VoucherStatusEnum.active,
                        Voucher.balance > 0
                    ).first()

                    if not voucher:
                        raise ValueError(f"Invalid or expired voucher: {code}")

                    deduct = min(voucher.balance, remaining)
                    redemptions_to_create.append((voucher, deduct))
                    voucher_used += deduct
                    remaining -= deduct

                    if voucher.balance <= deduct:
                        voucher.status = VoucherStatusEnum.redeemed

                    voucher.balance -= deduct

                    if remaining <= 0:
                        break

            cash_paid = total_amount - voucher_used

            # Create order
            order = Order(
                beneficiary_id=beneficiary_uuid,
                vendor_id=vendor_uuid,
                total_amount=total_amount,
                voucher_used=voucher_used,
                cash_paid=cash_paid,
                status=OrderStatusEnum.pending,
                notes=data.notes,
            )
            db.add(order)
            db.flush()

            # Create order items and deduct stock
            for product, item in validated_items:
                order_item = OrderItem(
                    order_id=order.id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    price=item.price,
                    subtotal=item.price * item.quantity,
                )
                db.add(order_item)
                product.stock_quantity -= item.quantity

                if product.stock_quantity < 10:
                    logger.warning(f"Low stock alert: {product.name} ({product.stock_quantity} remaining)")

            # Create voucher redemptions
            for voucher, amount in redemptions_to_create:
                redemption = VoucherRedemption(
                    voucher_id=voucher.id,
                    order_id=order.id,
                    amount=amount,
                )
                db.add(redemption)

            db.commit()
            db.refresh(order)
            logger.info(f"Order created: {order.id} by beneficiary {beneficiary_uuid}")
            return order

        except Exception as e:
            db.rollback()
            logger.error(f"Order creation failed: {str(e)}")
            raise

    @staticmethod
    def count_orders(db: Session, user_id: str, role: str, params: OrderQueryParams, vendor_id: Optional[str] = None) -> int:
        """Count total orders matching filters for pagination"""
        query = db.query(Order).filter(Order.is_active)
        user_uuid = OrderService._to_uuid(user_id)
        vendor_uuid = OrderService._to_uuid(vendor_id) if vendor_id else None

        if role == "beneficiary":
            query = query.filter(Order.beneficiary_id == user_uuid)
        elif role == "vendor":
            effective_vendor_id = vendor_uuid or user_uuid
            query = query.filter(Order.vendor_id == effective_vendor_id)

        if params.status:
            query = query.filter(Order.status == params.status)
        query = OrderService._apply_search(query, params.search)

        return query.count()

    @staticmethod
    def get_orders(db: Session, user_id: str, role: str, params: OrderQueryParams, vendor_id: Optional[str] = None) -> List[Order]:
        query = db.query(Order).filter(Order.is_active)
        user_uuid = OrderService._to_uuid(user_id)
        vendor_uuid = OrderService._to_uuid(vendor_id) if vendor_id else None

        if role == "beneficiary":
            query = query.filter(Order.beneficiary_id == user_uuid)
        elif role == "vendor":
            effective_vendor_id = vendor_uuid or user_uuid
            query = query.filter(Order.vendor_id == effective_vendor_id)

        if params.status:
            query = query.filter(Order.status == params.status)
        query = OrderService._apply_search(query, params.search)

        return query.order_by(Order.created_at.desc()).all()

    @staticmethod
    def get_order_by_id(db: Session, order_id: str, user_id: str, role: str) -> Optional[Order]:
        order_uuid = OrderService._to_uuid(order_id)
        user_uuid = OrderService._to_uuid(user_id)
        query = db.query(Order).filter(Order.id == order_uuid)

        if role == "beneficiary":
            query = query.filter(Order.beneficiary_id == user_uuid)
        elif role == "vendor":
            query = query.filter(Order.vendor_id == user_uuid)

        return query.first()

    @staticmethod
    def update_order_status(db: Session, order_id: str, vendor_id: str, data: OrderStatusUpdate) -> Optional[Order]:
        order_uuid = OrderService._to_uuid(order_id)
        vendor_uuid = OrderService._to_uuid(vendor_id)
        order = db.query(Order).filter(
            Order.id == order_uuid,
            Order.vendor_id == vendor_uuid,
            Order.is_active
        ).first()

        if not order:
            return None

        if order.status != OrderStatusEnum.pending:
            raise ValueError("Only pending orders can be updated")

        if data.status == "completed":
            order.status = OrderStatusEnum.completed
            
            # Add order amount to vendor wallet (net amount after admin fee)
            vendor = db.query(VendorProfile).filter(VendorProfile.user_id == vendor_uuid).first()
            if vendor:
                # Calculate net amount (assuming 1% admin fee)
                admin_fee_percentage = Decimal("0.01")
                admin_fee = order.cash_amount * admin_fee_percentage
                net_amount = order.cash_amount - admin_fee
                
                vendor.wallet_balance += net_amount
                db.add(vendor)
                logger.info(f"Added {net_amount} to vendor {vendor_id} wallet. New balance: {vendor.wallet_balance}")
                
        elif data.status == "cancelled":
            order.status = OrderStatusEnum.cancelled
            # Restore stock
            for item in order.items:
                product = db.query(Product).filter(Product.id == item.product_id).first()
                if product:
                    product.stock_quantity += item.quantity

        db.commit()
        db.refresh(order)
        logger.info(f"Order {order_id} status updated to {data.status}")
        return order
