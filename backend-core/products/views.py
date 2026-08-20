from django.utils.decorators import method_decorator
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions

from products.filters import ProductFilter
from products.models import Product
from products.pagination import ProductPagination
from products.serializers import ProductSerializer
from products.swagger_schemas import (
    PRODUCT_DETAIL_SWAGGER_DECORATOR,
    PRODUCT_LIST_SWAGGER_DECORATOR,
)


@method_decorator(name="get", decorator=PRODUCT_LIST_SWAGGER_DECORATOR)
class ProductListView(generics.ListAPIView):
    """
    GET /api/v1/products/
    Args:
        - page (query param, optional, default 1)
        - page_size (query param, optional, default 10, max 20)
        - location (query param, optional, "JO" or "SA")
    Return:
        - paginated list of products
    """

    queryset = Product.objects.order_by("id")
    serializer_class = ProductSerializer
    pagination_class = ProductPagination
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = ProductFilter


@method_decorator(name="get", decorator=PRODUCT_DETAIL_SWAGGER_DECORATOR)
class ProductDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/products/<id>/
    Args:
        - id (URL path parameter)
    Return:
        - a single product
    """

    queryset = Product.objects.order_by("id")
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated]
