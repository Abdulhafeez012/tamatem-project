from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status

from products.serializers import ProductSerializer

PRODUCT_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["id", "title", "description", "price", "location"],
    properties={
        "id": openapi.Schema(type=openapi.TYPE_INTEGER, example=1),
        "title": openapi.Schema(type=openapi.TYPE_STRING, example="PlayStation 5"),
        "description": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="Slim edition console with one controller.",
        ),
        "price": openapi.Schema(type=openapi.TYPE_STRING, example="499.99"),
        "location": openapi.Schema(
            type=openapi.TYPE_STRING,
            enum=["JO", "SA"],
            example="JO",
        ),
    },
    example={
        "id": 1,
        "title": "PlayStation 5",
        "description": "Slim edition console with one controller.",
        "price": "499.99",
        "location": "JO",
    },
)

PRODUCT_LIST_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["count", "next", "previous", "results"],
    properties={
        "count": openapi.Schema(type=openapi.TYPE_INTEGER, example=2),
        "next": openapi.Schema(
            type=openapi.TYPE_STRING,
            format=openapi.FORMAT_URI,
            x_nullable=True,
            example=None,
        ),
        "previous": openapi.Schema(
            type=openapi.TYPE_STRING,
            format=openapi.FORMAT_URI,
            x_nullable=True,
            example=None,
        ),
        "results": openapi.Schema(
            type=openapi.TYPE_ARRAY,
            items=PRODUCT_SCHEMA,
        ),
    },
    example={
        "count": 2,
        "next": None,
        "previous": None,
        "results": [
            {
                "id": 1,
                "title": "PlayStation 5",
                "description": "Slim edition console with one controller.",
                "price": "499.99",
                "location": "JO",
            },
            {
                "id": 2,
                "title": "Nintendo Switch OLED",
                "description": "White Joy-Con bundle in excellent condition.",
                "price": "329.00",
                "location": "SA",
            },
        ],
    },
)

DETAIL_ERROR_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        "detail": openapi.Schema(type=openapi.TYPE_STRING),
    },
    required=["detail"],
)

FILTER_ERROR_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        "location": openapi.Schema(type=openapi.TYPE_STRING),
    },
    required=["location"],
    example={
        "location": "Must be one of: JO, SA.",
    },
)

PRODUCT_LIST_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Products"],
    security=[{"Bearer": []}],
    operation_summary="List products",
    operation_description="Returns a paginated list of products. Requires a valid JWT access token.",
    manual_parameters=[
        openapi.Parameter(
            "page",
            openapi.IN_QUERY,
            description="Page number to retrieve.",
            type=openapi.TYPE_INTEGER,
            example=1,
        ),
        openapi.Parameter(
            "page_size",
            openapi.IN_QUERY,
            description="Number of products per page. Default is 10 and maximum is 20.",
            type=openapi.TYPE_INTEGER,
            example=10,
        ),
        openapi.Parameter(
            "location",
            openapi.IN_QUERY,
            description="Filter products by location.",
            type=openapi.TYPE_STRING,
            enum=["JO", "SA"],
            example="JO",
        ),
    ],
    responses={
        status.HTTP_200_OK: openapi.Response(
            description="Products fetched successfully",
            schema=PRODUCT_LIST_SCHEMA,
            examples={
                "application/json": {
                    "count": 2,
                    "next": None,
                    "previous": None,
                    "results": [
                        {
                            "id": 1,
                            "title": "PlayStation 5",
                            "description": "Slim edition console with one controller.",
                            "price": "499.99",
                            "location": "JO",
                        },
                        {
                            "id": 2,
                            "title": "Nintendo Switch OLED",
                            "description": "White Joy-Con bundle in excellent condition.",
                            "price": "329.00",
                            "location": "SA",
                        },
                    ],
                }
            },
        ),
        status.HTTP_400_BAD_REQUEST: openapi.Response(
            description="Invalid query parameter",
            schema=FILTER_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "location": "Must be one of: JO, SA.",
                }
            },
        ),
        status.HTTP_401_UNAUTHORIZED: openapi.Response(
            description="Missing or invalid JWT token",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Authentication credentials were not provided.",
                }
            },
        ),
    },
)

PRODUCT_DETAIL_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Products"],
    security=[{"Bearer": []}],
    operation_summary="Retrieve a single product",
    operation_description="Returns a single product by ID. Requires a valid JWT access token.",
    manual_parameters=[
        openapi.Parameter(
            "pk",
            openapi.IN_PATH,
            description="The product ID.",
            type=openapi.TYPE_INTEGER,
            required=True,
            example=1,
        ),
    ],
    responses={
        status.HTTP_200_OK: openapi.Response(
            description="Product fetched successfully",
            schema=ProductSerializer,
            examples={
                "application/json": {
                    "id": 1,
                    "title": "PlayStation 5",
                    "description": "Slim edition console with one controller.",
                    "price": "499.99",
                    "location": "JO",
                }
            },
        ),
        status.HTTP_401_UNAUTHORIZED: openapi.Response(
            description="Missing or invalid JWT token",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Authentication credentials were not provided.",
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
