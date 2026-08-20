from rest_framework import serializers

from products.models import Product


class ProductSerializer(serializers.ModelSerializer):
    """
    Used for both the list and detail endpoints -- same fields either way,
    so one serializer keeps the API's shape consistent instead of returning
    a thinner object in the list than the detail view promises.
    """

    class Meta:
        model = Product
        fields = ("id", "title", "description", "price", "location")
        read_only_fields = fields
