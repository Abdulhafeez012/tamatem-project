from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from api.v1.orders.views import PurchaseView
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
            HTTP_IDEMPOTENCY_KEY="3f6b1a5e-9c42-4b7d-8e10-2a5f6c8d1b39",
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


class PurchaseIdempotencyTests(APITestCase):
    """
    Retrying a purchase must not charge someone twice.

    The header is optional, so the no-key path is covered here too: it has to
    keep behaving exactly as it did before idempotency existed.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            password="testpassword",
        )

        self.other_user = User.objects.create_user(
            username="otheruser",
            password="testpassword",
        )

        self.product = Product.objects.create(
            title="PlayStation 5",
            description="Slim edition console with one controller.",
            price=Decimal("499.99"),
            location="JO",
        )

        self.url = reverse("orders:purchase")
        self.key = "3f6b1a5e-9c42-4b7d-8e10-2a5f6c8d1b39"

    def purchase(self, key=None, user=None):
        self.client.force_authenticate(user=user or self.user)
        headers = {"HTTP_IDEMPOTENCY_KEY": key} if key is not None else {}
        return self.client.post(
            self.url,
            {"product_id": self.product.id},
            format="json",
            **headers,
        )

    def test_first_purchase_with_key_creates_order(self):
        response = self.purchase(key=self.key)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("Idempotent-Replay", response)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Order.objects.get().idempotency_key, self.key)

    def test_retry_with_same_key_returns_the_original_order(self):
        first = self.purchase(key=self.key)
        second = self.purchase(key=self.key)

        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second["Idempotent-Replay"], "true")

        # One order, and the replay describes that very order.
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(
            second.data["order_number"],
            first.data["order_number"],
        )
        self.assertEqual(second.data, first.data)

    def test_repeated_retries_stay_idempotent(self):
        self.purchase(key=self.key)
        for _ in range(4):
            self.purchase(key=self.key)

        self.assertEqual(Order.objects.count(), 1)

    def test_different_keys_create_separate_orders(self):
        self.purchase(key=self.key)
        response = self.purchase(key="a-different-key")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 2)

    def test_key_is_scoped_per_user(self):
        # The same key from another account must not hand back someone else's
        # order -- that would leak one user's purchase to another.
        first = self.purchase(key=self.key)
        second = self.purchase(key=self.key, user=self.other_user)

        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 2)
        self.assertNotEqual(
            second.data["order_number"],
            first.data["order_number"],
        )

    def test_purchase_without_a_key_is_rejected(self):
        # The header is mandatory, so retry-safety cannot be skipped by a client
        # that simply forgets to opt in.
        response = self.purchase()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Idempotency-Key", response.data["detail"])
        self.assertIn("required", response.data["detail"])
        self.assertEqual(Order.objects.count(), 0)

    def test_blank_key_is_rejected(self):
        # A header present but empty, or only whitespace, is the same mistake as
        # not sending one -- it must not fall through as "no key".
        for blank in ("", "   ", "\t"):
            with self.subTest(key=blank):
                response = self.purchase(key=blank)

                self.assertEqual(
                    response.status_code, status.HTTP_400_BAD_REQUEST
                )
                self.assertEqual(Order.objects.count(), 0)

    def test_key_is_trimmed_before_matching(self):
        self.purchase(key=self.key)
        response = self.purchase(key=f"  {self.key}  ")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Order.objects.count(), 1)

    def test_over_long_key_is_rejected(self):
        response = self.purchase(key="x" * 256)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Idempotency-Key", response.data["detail"])
        self.assertEqual(Order.objects.count(), 0)

    def test_maximum_length_key_is_accepted(self):
        response = self.purchase(key="x" * 255)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 1)

    def test_concurrent_retry_that_loses_the_race_replays(self):
        # Two simultaneous retries: the pre-flight lookup finds nothing, then
        # the insert loses to the winner's unique constraint. Patching
        # _find_replay to miss once and then hit reproduces that interleaving
        # without needing real threads.
        winner = Order.objects.create(
            user=self.user,
            product=self.product,
            quantity=1,
            unit_price=self.product.price,
            total_price=self.product.price,
            idempotency_key=self.key,
        )

        with patch.object(
            PurchaseView, "_find_replay", side_effect=[None, winner]
        ):
            response = self.purchase(key=self.key)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Idempotent-Replay"], "true")
        self.assertEqual(
            response.data["order_number"],
            str(winner.order_number),
        )
        self.assertEqual(Order.objects.count(), 1)

    def test_unauthenticated_purchase_with_key_creates_nothing(self):
        self.client.force_authenticate(user=None)

        response = self.client.post(
            self.url,
            {"product_id": self.product.id},
            format="json",
            HTTP_IDEMPOTENCY_KEY=self.key,
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(Order.objects.count(), 0)

    def test_cors_preflight_allows_the_idempotency_key_header(self):
        # A custom header makes the browser send a preflight first, and the
        # preflight fails unless CORS_ALLOW_HEADERS names it. Nothing above
        # catches that -- the test client sends no preflight, so the whole
        # feature can pass its tests and still be broken in a browser.
        response = self.client.options(
            self.url,
            HTTP_ORIGIN="http://localhost:3000",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="idempotency-key,authorization",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(
            "idempotency-key",
            response["Access-Control-Allow-Headers"].lower(),
        )

    def test_replay_header_is_exposed_to_the_browser(self):
        # Response headers are unreadable from JavaScript unless exposed, so a
        # client could not otherwise detect a replay.
        self.purchase(key=self.key)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url,
            {"product_id": self.product.id},
            format="json",
            HTTP_IDEMPOTENCY_KEY=self.key,
            HTTP_ORIGIN="http://localhost:3000",
        )

        self.assertEqual(response["Idempotent-Replay"], "true")
        self.assertIn(
            "Idempotent-Replay",
            response["Access-Control-Expose-Headers"],
        )