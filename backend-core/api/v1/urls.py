from django.urls import path, include

urlpatterns = [
    path("auth/", include("api.v1.accounts.urls")),
    path("products/", include("api.v1.products.urls")),
    path("orders/", include("api.v1.orders.urls"))
]