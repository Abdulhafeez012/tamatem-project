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
            example="ORD-20260821-0001",
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
            example="PENDING",
        ),
        "created_at": openapi.Schema(
            type=openapi.TYPE_STRING,
            format=openapi.FORMAT_DATETIME,
            example="2026-08-21T10:30:00Z",
        ),
    },
    example={
        "order_number": "ORD-20260821-0001",
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
        "status": "PENDING",
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
            "Ensure this value is greater than or equal to 1."
        ],
    },
)


PURCHASE_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Orders"],
    security=[{"Bearer": []}],
    operation_summary="Purchase a product",
    operation_description=(
        "Creates a new order for the authenticated user. "
        "The order quantity is currently fixed at 1, and the product's "
        "current price is saved as the unit and total price."
    ),
    request_body=PurchaseRequestSerializer,
    responses={
        status.HTTP_201_CREATED: openapi.Response(
            description="Order created successfully",
            schema=ORDER_SCHEMA,
            examples={
                "application/json": {
                    "order_number": "ORD-20260821-0001",
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
                    "status": "PENDING",
                    "created_at": "2026-08-21T10:30:00Z",
                }
            },
        ),
        status.HTTP_400_BAD_REQUEST: openapi.Response(
            description="Invalid purchase request",
            schema=PURCHASE_VALIDATION_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "product_id": [
                        "Ensure this value is greater than or equal to 1."
                    ]
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
            description="The unique order number.",
            type=openapi.TYPE_STRING,
            required=True,
            example="ORD-20260821-0001",
        ),
    ],
    responses={
        status.HTTP_200_OK: openapi.Response(
            description="Order receipt fetched successfully",
            schema=ORDER_SCHEMA,
            examples={
                "application/json": {
                    "order_number": "ORD-20260821-0001",
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
                    "status": "PENDING",
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