from django.urls import path

from orders.views import (
    PurchaseView,
    ReceiptView
)

app_name = "orders"

urlpatterns = [
    path("purchase/", PurchaseView.as_view(), name="purchase"),
    path("<uuid:order_number>/", ReceiptView.as_view(), name="receipt"),
]
