import uuid

from django.conf import settings
from django.db import models

from products.models import Product
from orders.enums import OrderStatus

class Order(models.Model):
    order_number = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True,
        db_index=True
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="orders"
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="orders"
    )
    quantity = models.PositiveIntegerField(
        null=True,
        blank=True
    )
    unit_price = models.DecimalField(
        null=True,
        blank=True,
        max_digits=10,
        decimal_places=2
    )
    total_price = models.DecimalField(
        null=True,
        blank=True,
        max_digits=10,
        decimal_places=2
    )
    status = models.CharField(
        max_length=20,
        choices=OrderStatus.choices(),
        default=OrderStatus.PENDING.value,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Order {self.order_number} - {self.product.title}"
