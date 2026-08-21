from django.contrib import admin

from orders.models import Order


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("order_number", "user", "product", "quantity", "total_price", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("order_number", "user__username", "product__title")
    readonly_fields = ("order_number", "created_at")
