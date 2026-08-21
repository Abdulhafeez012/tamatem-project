from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from orders.models import Order
from products.models import Product


User = get_user_model()


class PurchaseViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            password="testpassword",
        )

        self.product = Product.objects.create(
            title="PlayStation 5",
            description="Slim edition console with one controller.",
            price=Decimal("499.99"),
            location="JO",
        )

        self.url = reverse("orders:purchase")

    def test_purchase_product_successfully(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url,
            {"product_id": self.product.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        self.assertEqual(Order.objects.count(), 1)

        order = Order.objects.get()

        self.assertEqual(order.user, self.user)
        self.assertEqual(order.product, self.product)
        self.assertEqual(order.quantity, 1)
        self.assertEqual(order.unit_price, self.product.price)
        self.assertEqual(order.total_price, self.product.price)

        self.assertEqual(
            response.data["order_number"],
            str(order.order_number),
        )
        self.assertEqual(response.data["quantity"], 1)
        self.assertEqual(response.data["unit_price"], "499.99")
        self.assertEqual(response.data["total_price"], "499.99")
        self.assertEqual(
            response.data["product"]["id"],
            self.product.id,
        )

    def test_purchase_requires_authentication(self):
        response = self.client.post(
            self.url,
            {"product_id": self.product.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        self.assertEqual(Order.objects.count(), 0)

    def test_purchase_requires_product_id(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url,
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn("product_id", response.data)
        self.assertEqual(Order.objects.count(), 0)

    def test_purchase_rejects_invalid_product_id(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url,
            {"product_id": 0},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn("product_id", response.data)
        self.assertEqual(Order.objects.count(), 0)

    def test_purchase_rejects_non_existing_product(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url,
            {"product_id": 999999},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn("product_id", response.data)
        self.assertEqual(
            response.data["product_id"][0],
            "Product not found.",
        )

        self.assertEqual(Order.objects.count(), 0)


class ReceiptViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            password="testpassword",
        )

        self.product = Product.objects.create(
            title="PlayStation 5",
            description="Slim edition console with one controller.",
            price=Decimal("499.99"),
            location="JO",
        )

        self.order = Order.objects.create(
            user=self.user,
            product=self.product,
            quantity=1,
            unit_price=self.product.price,
            total_price=self.product.price,
        )

        self.url = reverse(
            "orders:receipt",
            kwargs={
                "order_number": self.order.order_number,
            },
        )

    def test_get_receipt_successfully(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            response.data["order_number"],
            str(self.order.order_number),
        )
        self.assertEqual(response.data["quantity"], 1)
        self.assertEqual(response.data["unit_price"], "499.99")
        self.assertEqual(response.data["total_price"], "499.99")

        self.assertEqual(
            response.data["product"]["id"],
            self.product.id,
        )

    def test_receipt_requires_authentication(self):
        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_user_cannot_access_another_users_order(self):
        another_user = User.objects.create_user(
            username="anotheruser",
            password="testpassword",
        )

        self.client.force_authenticate(user=another_user)

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.assertEqual(
            response.data["detail"],
            "Order Not Found.",
        )

    def test_receipt_returns_404_for_non_existing_order(self):
        self.client.force_authenticate(user=self.user)

        url = reverse(
            "orders:receipt",
            kwargs={
                "order_number": "00000000-0000-0000-0000-000000000000",
            },
        )

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.assertEqual(
            response.data["detail"],
            "Order Not Found.",
        )