import django_filters
from rest_framework.exceptions import ValidationError

from products.enums import Location
from products.models import Product


class ProductFilter(django_filters.FilterSet):
    location = django_filters.CharFilter(method="filter_location")

    class Meta:
        model = Product
        fields = ["location"]

    def filter_location(self, queryset, name, value):
        value = value.strip().upper()
        valid_locations = {choice.value for choice in Location}
        if value not in valid_locations:
            raise ValidationError(
                {"location": f"Must be one of: {', '.join(sorted(valid_locations))}."}
            )
        return queryset.filter(location=value)
