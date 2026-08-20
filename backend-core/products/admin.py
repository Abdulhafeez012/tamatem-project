from django.contrib import admin

from products.models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "location", "price", "created_at")
    list_filter = ("location",)
    search_fields = ("title", "description")
