from rest_framework import serializers

from products.models import Product
from api.v1.products.serializers import ProductSerializer

from orders.models import Order


class PurchaseRequestSerializer(serializers.Serializer):
    """
    Serializer for the purchase request payload.
    It only requires the product_id to identify which product the user wants to purchase.
    """
    product_id = serializers.IntegerField(
        min_value=1,
        error_messages={
            "required": "Product ID is required.",
            "invalid": "Product ID must be a valid integer.",
            "min_value": "Product ID must be greater than or equal to 1.",
        },
    )

    @staticmethod
    def validate_product_id(value):
        if not Product.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Product not found.")

        return value


class OrderSerializer(serializers.ModelSerializer):
    """
    Serializer for the Order model.
    It includes all the fields of the Order model and uses the ProductSerializer to represent the related product.
    The product field is read-only, meaning it cannot be modified through this serializer.
    """

    product = ProductSerializer(read_only=True)

    class Meta:
        model = Order
        fields = (
            "order_number",
            "product",
            "quantity",
            "unit_price",
            "total_price",
            "status",
            "created_at",
        )
        read_only_fields = fields
