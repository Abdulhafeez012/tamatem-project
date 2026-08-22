from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status

from api.v1.orders.serializers import PurchaseRequestSerializer


PRODUCT_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["id", "title", "description", "price", "location"],
    properties={
        "id": openapi.Schema(type=openapi.TYPE_INTEGER, example=1),
        "title": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="PlayStation 5",
        ),
        "description": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="Slim edition console with one controller.",
        ),
        "price": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="499.99",
        ),
        "location": openapi.Schema(
            type=openapi.TYPE_STRING,
            enum=["JO", "SA"],
            example="JO",
        ),
    },
)


ORDER_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=[
        "order_number",
        "product",
        "quantity",
        "unit_price",
        "total_price",
        "status",
        "created_at",
    ],
    properties={
        "order_number": openapi.Schema(
            type=openapi.TYPE_STRING,
            format=openapi.FORMAT_UUID,
            example="3f6b1a5e-9c42-4b7d-8e10-2a5f6c8d1b39",
        ),
        "product": PRODUCT_SCHEMA,
        "quantity": openapi.Schema(
            type=openapi.TYPE_INTEGER,
            example=1,
        ),
        "unit_price": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="499.99",
        ),
        "total_price": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="499.99",
        ),
        "status": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="COMPLETED",
        ),
        "created_at": openapi.Schema(
            type=openapi.TYPE_STRING,
            format=openapi.FORMAT_DATETIME,
            example="2026-08-21T10:30:00Z",
        ),
    },
    example={
        "order_number": "3f6b1a5e-9c42-4b7d-8e10-2a5f6c8d1b39",
        "product": {
            "id": 1,
            "title": "PlayStation 5",
            "description": "Slim edition console with one controller.",
            "price": "499.99",
            "location": "JO",
        },
        "quantity": 1,
        "unit_price": "499.99",
        "total_price": "499.99",
        "status": "COMPLETED",
        "created_at": "2026-08-21T10:30:00Z",
    },
)


DETAIL_ERROR_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        "detail": openapi.Schema(type=openapi.TYPE_STRING),
    },
    required=["detail"],
)


PURCHASE_REQUEST_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["product_id"],
    properties={
        "product_id": openapi.Schema(
            type=openapi.TYPE_INTEGER,
            minimum=1,
            example=1,
        ),
    },
    example={
        "product_id": 1,
    },
)


PURCHASE_VALIDATION_ERROR_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        "product_id": openapi.Schema(
            type=openapi.TYPE_ARRAY,
            items=openapi.Schema(type=openapi.TYPE_STRING),
        ),
    },
    example={
        "product_id": [
            "Product ID must be greater than or equal to 1."
        ],
    },
)


IDEMPOTENCY_KEY_PARAMETER = openapi.Parameter(
    "Idempotency-Key",
    openapi.IN_HEADER,
    description=(
        "**Required.** A unique value per purchase attempt -- a UUID is the "
        "obvious choice. Reuse the same value when retrying: the repeat returns "
        "the order the first call created (200, with an `Idempotent-Replay: "
        "true` header) instead of placing a second one. Keys are scoped per "
        "user and may be at most 255 characters. A new, intentional purchase "
        "needs a new key."
    ),
    type=openapi.TYPE_STRING,
    required=True,
)


PURCHASE_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Orders"],
    security=[{"Bearer": []}],
    operation_summary="Purchase a product",
    operation_description=(
        "Creates a new order for the authenticated user. "
        "The order quantity is currently fixed at 1, and the product's "
        "current price is saved as the unit and total price.\n\n"
        "An `Idempotency-Key` header is **required**, which makes every purchase "
        "retry-safe by construction: a repeat with the same key returns `200` "
        "with the original order rather than creating a duplicate. A request "
        "without the header is rejected with `400`."
    ),
    request_body=PurchaseRequestSerializer,
    manual_parameters=[IDEMPOTENCY_KEY_PARAMETER],
    responses={
        status.HTTP_200_OK: openapi.Response(
            description=(
                "Replay: an order already exists for this Idempotency-Key, and "
                "is returned unchanged. Carries `Idempotent-Replay: true`."
            ),
            schema=ORDER_SCHEMA,
        ),
        status.HTTP_201_CREATED: openapi.Response(
            description="Order created successfully",
            schema=ORDER_SCHEMA,
            examples={
                "application/json": {
                    "order_number": "3f6b1a5e-9c42-4b7d-8e10-2a5f6c8d1b39",
                    "product": {
                        "id": 1,
                        "title": "PlayStation 5",
                        "description": (
                            "Slim edition console with one controller."
                        ),
                        "price": "499.99",
                        "location": "JO",
                    },
                    "quantity": 1,
                    "unit_price": "499.99",
                    "total_price": "499.99",
                    "status": "COMPLETED",
                    "created_at": "2026-08-21T10:30:00Z",
                }
            },
        ),
        status.HTTP_400_BAD_REQUEST: openapi.Response(
            description=(
                "Invalid purchase request, or a missing / over-long "
                "Idempotency-Key header"
            ),
            schema=PURCHASE_VALIDATION_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "product_id": [
                        "Product ID must be greater than or equal to 1."
                    ]
                },
                "application/json (missing header)": {
                    "detail": (
                        "Idempotency-Key header is required. Send a unique "
                        "value per purchase attempt (a UUID is the obvious "
                        "choice) and reuse it when retrying."
                    )
                },
            },
        ),
        status.HTTP_401_UNAUTHORIZED: openapi.Response(
            description="Missing or invalid JWT token",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": (
                        "Authentication credentials were not provided."
                    ),
                }
            },
        ),
        status.HTTP_404_NOT_FOUND: openapi.Response(
            description="Product not found",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Product not found.",
                }
            },
        ),
    },
)


RECEIPT_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Orders"],
    security=[{"Bearer": []}],
    operation_summary="Retrieve an order receipt",
    operation_description=(
        "Returns an order receipt by order number. "
        "Users can only retrieve their own orders."
    ),
    manual_parameters=[
        openapi.Parameter(
            "order_number",
            openapi.IN_PATH,
            description=(
                "The order's UUID. The route uses a <uuid:...> converter, so "
                "a non-UUID value does not match the URL at all."
            ),
            type=openapi.TYPE_STRING,
            format=openapi.FORMAT_UUID,
            required=True,
            example="3f6b1a5e-9c42-4b7d-8e10-2a5f6c8d1b39",
        ),
    ],
    responses={
        status.HTTP_200_OK: openapi.Response(
            description="Order receipt fetched successfully",
            schema=ORDER_SCHEMA,
            examples={
                "application/json": {
                    "order_number": "3f6b1a5e-9c42-4b7d-8e10-2a5f6c8d1b39",
                    "product": {
                        "id": 1,
                        "title": "PlayStation 5",
                        "description": (
                            "Slim edition console with one controller."
                        ),
                        "price": "499.99",
                        "location": "JO",
                    },
                    "quantity": 1,
                    "unit_price": "499.99",
                    "total_price": "499.99",
                    "status": "COMPLETED",
                    "created_at": "2026-08-21T10:30:00Z",
                }
            },
        ),
        status.HTTP_401_UNAUTHORIZED: openapi.Response(
            description="Missing or invalid JWT token",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": (
                        "Authentication credentials were not provided."
                    ),
                }
            },
        ),
        status.HTTP_404_NOT_FOUND: openapi.Response(
            description="Order not found",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Order Not Found.",
                }
            },
        ),
    },
)