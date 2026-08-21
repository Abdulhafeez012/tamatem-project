from django.db import transaction
from django.http import Http404
from django.utils.decorators import method_decorator
from rest_framework import permissions, status, generics
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from products.models import Product
from orders.models import Order
from orders.serializers import OrderSerializer, PurchaseRequestSerializer
from orders.swagger_schemas import (
    PURCHASE_SWAGGER_DECORATOR,
    RECEIPT_SWAGGER_DECORATOR
)


@method_decorator(
    name="post",
    decorator=PURCHASE_SWAGGER_DECORATOR
)
class PurchaseView(generics.CreateAPIView):
    """
    POST /api/v1/orders/purchase/
    Args:
        - product_id
    Return:
        - order_number
        - product
        - quantity
        - unit_price
        - total_price
        - status
        - created_at
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def create(self, request, *args, **kwargs):
        serializer = PurchaseRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product_id = serializer.validated_data["product_id"]

        with transaction.atomic():
            try:
                product = Product.objects.select_for_update().get(pk=product_id)
            except Product.DoesNotExist:
                return Response(
                    {"detail": "Product not found."},
                    status=status.HTTP_404_NOT_FOUND
                )
            order = Order.objects.create(
                user=request.user,
                product=product,
                quantity=1,
                unit_price=product.price,
                total_price=product.price,
            )

        return Response(
            self.serializer_class(order).data,
            status=status.HTTP_201_CREATED
        )


@method_decorator(
    name="get",
    decorator=RECEIPT_SWAGGER_DECORATOR
)
class ReceiptView(generics.RetrieveAPIView):
    """
    GET /api/v1/orders/<order_number>/
    Args:
        - order_number (URL path parameter)
    Return:
        - order_number
        - product
        - quantity
        - unit_price
        - total_price
        - status
        - created_at
    """

    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "order_number"
    lookup_url_kwarg = "order_number"

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user)

    def get_object(self):
        try:
            return super().get_object()
        except Http404:
           raise NotFound({"detail": "Order Not Found."})
