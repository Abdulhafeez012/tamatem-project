from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from products.enums import Location
from products.models import Product

User = get_user_model()


class ProductListTests(APITestCase):
    url = reverse("products:list")

    def setUp(self):
        self.user = User.objects.create_user(
            username="aboud",
            email="aboud@example.com",
            password="Str0ngPass!23",
        )
        self.jordan_product = Product.objects.create(
            title="PlayStation 5",
            description="Slim edition console with one controller.",
            price=Decimal("499.99"),
            location=Location.JORDAN,
        )
        self.saudi_product = Product.objects.create(
            title="Nintendo Switch OLED",
            description="White Joy-Con bundle in excellent condition.",
            price=Decimal("329.00"),
            location=Location.SAUDI_ARABIA,
        )

    def authenticate(self):
        self.client.force_authenticate(user=self.user)

    def test_product_list_requires_authentication(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_product_list_returns_paginated_products(self):
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertIsNone(response.data["next"])
        self.assertIsNone(response.data["previous"])
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(response.data["results"][0]["title"], "PlayStation 5")
        self.assertEqual(response.data["results"][0]["price"], "499.99")
        self.assertEqual(response.data["results"][1]["title"], "Nintendo Switch OLED")
        self.assertEqual(response.data["results"][1]["location"], "SA")

    def test_product_list_filters_by_location_case_insensitively(self):
        self.authenticate()

        response = self.client.get(self.url, {"location": "jo"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["id"], self.jordan_product.id)
        self.assertEqual(response.data["results"][0]["location"], "JO")

    def test_product_list_invalid_location_returns_400(self):
        self.authenticate()

        response = self.client.get(self.url, {"location": "EG"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["location"], "Must be one of: JO, SA.")

    def test_product_list_trims_whitespace_in_location_filter(self):
        self.authenticate()

        response = self.client.get(self.url, {"location": " sa "})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.saudi_product.id)

    def test_product_list_caps_page_size_at_maximum(self):
        self.authenticate()
        for index in range(3, 28):
            Product.objects.create(
                title=f"Extra product {index}",
                description="bulk test product",
                price=Decimal("10.00"),
                location=Location.JORDAN,
            )

        response = self.client.get(self.url, {"page_size": 100})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 27)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])


class ProductDetailTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="aboud",
            email="aboud@example.com",
            password="Str0ngPass!23",
        )
        self.product = Product.objects.create(
            title="PlayStation 5",
            description="Slim edition console with one controller.",
            price=Decimal("499.99"),
            location=Location.JORDAN,
        )
        self.url = reverse("products:detail", kwargs={"pk": self.product.pk})

    def authenticate(self):
        self.client.force_authenticate(user=self.user)

    def test_product_detail_requires_authentication(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_product_detail_returns_product(self):
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.product.id)
        self.assertEqual(response.data["title"], "PlayStation 5")
        self.assertEqual(response.data["description"], "Slim edition console with one controller.")
        self.assertEqual(response.data["price"], "499.99")
        self.assertEqual(response.data["location"], "JO")

    def test_product_detail_not_found_returns_404(self):
        self.authenticate()

        response = self.client.get(reverse("products:detail", kwargs={"pk": 99999}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
