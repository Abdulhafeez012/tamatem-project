from django.db import IntegrityError, transaction
from django.http import Http404
from django.utils.decorators import method_decorator
from rest_framework import permissions, status, generics
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from products.models import Product
from orders.models import Order
from api.v1.orders.serializers import OrderSerializer, PurchaseRequestSerializer
from api.v1.orders.swagger_schemas import (
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

    IDEMPOTENCY_HEADER = "Idempotency-Key"
    IDEMPOTENCY_KEY_MAX_LENGTH = 255

    def _read_idempotency_key(self, request):
        """
        Pull the Idempotency-Key header off the request. Returns (key, error).

        The header is mandatory. Making it optional would mean the API's
        retry-safety depended on each client remembering to opt in, and the one
        client that forgets is the one that double-charges someone. Requiring it
        moves that from a convention to a contract.
        """
        key = request.headers.get(self.IDEMPOTENCY_HEADER, "").strip()
        if not key:
            return None, Response(
                {
                    "detail": (
                        f"{self.IDEMPOTENCY_HEADER} header is required. Send a "
                        "unique value per purchase attempt (a UUID is the "
                        "obvious choice) and reuse it when retrying."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(key) > self.IDEMPOTENCY_KEY_MAX_LENGTH:
            return None, Response(
                {
                    "detail": (
                        f"{self.IDEMPOTENCY_HEADER} must be at most "
                        f"{self.IDEMPOTENCY_KEY_MAX_LENGTH} characters."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return key, None

    @staticmethod
    def _find_replay(user, idempotency_key):
        """
        Look for an order already placed with this idempotency key. Returns the
        order if found, or None if not.

        :param: user: the authenticated user making the request
        :param: idempotency_key: the value of the Idempotency-Key header
        :return: the order if found, or None if not
        """
        return Order.objects.filter(
            user=user, idempotency_key=idempotency_key
        ).first()

    def _replay_response(self, order):
        """
        200, not 201: this request created nothing.
        :param: order: the order that was already placed.
        :return: a Response with the order data and the Idempotent-Replay header
        """
        response = Response(
            self.serializer_class(order).data,
            status=status.HTTP_200_OK,
        )
        response["Idempotent-Replay"] = "true"
        return response

    @transaction.atomic
    def _place_order(self, user, product_id, idempotency_key):
        """
        Create the order under a row lock. Returns (order, error_response).

        Raises IntegrityError if the idempotency key was taken concurrently --
        the caller turns that into a replay.

        :param: user: the authenticated user making the request
        :param: product_id: the ID of the product to purchase
        :param: idempotency_key: the value of the Idempotency-Key header
        :return: (order, error_response) -- the order if created, or None and a Response
        """
        try:
            product = Product.objects.select_for_update().get(pk=product_id)
        except Product.DoesNotExist:
            return None, Response(
                {"detail": "Product not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        order = Order.objects.create(
            user=user,
            product=product,
            quantity=1,
            unit_price=product.price,
            total_price=product.price,
            idempotency_key=idempotency_key,
        )
        return order, None

    def create(self, request, *args, **kwargs):
        """
        Handle a purchase request. Validates the request, checks for an existing
        order with the same idempotency key, and either returns that order or
        creates a new one.
        :param request:
        :param args:
        :param kwargs:
        :return: Response with the order data and appropriate status code
        """
        serializer = PurchaseRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product_id = serializer.validated_data["product_id"]

        idempotency_key, error = self._read_idempotency_key(request)
        if error:
            return error

        already_placed = self._find_replay(request.user, idempotency_key)
        if already_placed:
            return self._replay_response(already_placed)

        try:
            order, error = self._place_order(
                request.user, product_id, idempotency_key
            )
        except IntegrityError:
            existing_order = self._find_replay(request.user, idempotency_key)
            if existing_order is None:
                raise
            return self._replay_response(existing_order)

        if error:
            return error

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
