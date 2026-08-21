from django.urls import path

from api.v1.products.views import ProductDetailView, ProductListView

app_name = "products"

urlpatterns = [
    path("", ProductListView.as_view(), name="list"),
    path("<int:pk>/", ProductDetailView.as_view(), name="detail"),
]
